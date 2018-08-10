'use strict';
const https = require('https');
const AWS = require('aws-sdk');
let sqs;


const triggerNext = (state, security, LOG) => {
    return new Promise((resolve, reject) => {
        if (state.workflow.workflow[state.currentStep].end && state.workflow.workflow[state.currentStep].end === "true") {
            LOG.log(`This step (${state.currentStep} was final step in workflow: ${state.workflowName}, execution uuid: ${state.executionUuid}`);

            // needs to be done for every separate invocation since one invocation could have different
            // credentials as previous ones
            AWS.config.update({
                accessKeyId: security.awsLambda.accessKeyId,
                secretAccessKey: security.awsLambda.secretAccessKey,
                region: state.workflow.workflow[state.currentStep].finishQueue.regionName
            });
            sqs = new AWS.SQS();

            if (state.workflow.workflow[state.currentStep].finishQueue) {
                publishEndStateToQueue(state, LOG).then(published => {
                    resolve(published)
                }).catch(publishedError => {
                    reject(publishedError)
                });
            } else resolve(`This step (${state.currentStep} was final step in workflow: ${state.workflowName}, execution uuid: ${state.executionUuid}`);
        } else if (state.workflow.workflow[state.currentStep].type === "Fail") {
            resolve(`This step (${state.currentStep} was a Fail state in workflow: ${state.workflowName}, execution uuid: ${state.executionUuid}`);
        } else if (state.nextStep) {
            if (state.workflow.workflow[state.nextStep].provider === "aws") {
                LOG.log(`Trigger next aws step: ${state.nextStep}`);
                triggerLambda(state, LOG).then(triggerLambdaResult => {
                    resolve(triggerLambdaResult)
                }).catch(triggerLambdaError => {
                    reject(triggerLambdaError)
                });
            } else if (state.workflow.workflow[state.nextStep].provider === "openWhisk") {
                LOG.log(`Trigger next openWhisk step: ${state.nextStep}`);
                triggerOpenWhisk(state, security, LOG).then(triggerOwResult => {
                    resolve(triggerOwResult)
                }).catch(triggerOwError => {
                    reject(triggerOwError)
                });
            } else {
                LOG.log(`Unknown provider for next Step: ${state.workflow.workflow[state.nextStep].provider}`);
                reject(`Unknown provider for next Step: ${state.workflow.workflow[state.nextStep].provider}`);
            }
        } else {
            LOG.log("No next step to trigger, because current step is either end or fail");
            resolve("No next step to trigger, because current step is either end or fail");
        }

    });
};

const publishEndStateToQueue = (state, LOG) => {
    return new Promise((resolve, reject) => {
        let postState = {};
        Object.assign(postState, state, {logs: LOG.logs});
        delete postState.nextStep;
        delete postState.workflow;
        delete postState.logs;
        let delay = state.workflow.workflow[state.currentStep].finishQueue.delaySeconds ? state.workflow.workflow[state.currentStep].finishQueue.delaySeconds : 0;

        let params = {
            MessageBody: JSON.stringify({workflowState: postState}), /* required */
            QueueUrl: state.workflow.workflow[state.currentStep].finishQueue.queueUrl, /* required */
            DelaySeconds: delay,
            MessageAttributes: {
                'executionUuid': {
                    DataType: 'String', /* required */
                    //  BinaryValue: new Buffer('...') || 'STRING_VALUE' /* Strings will be Base-64 encoded on your behalf */,
                    StringValue: state.executionUuid
                },
                /* '<String>': ... */
            }
        };

        sqs.sendMessage(params, (err, data) => {
            if (err) {
                LOG.err(`Error: Final state was not published to SNS Topic with ARN: ${state.workflow.workflow[state.currentStep].finishQueue.queueUrl}`);
                LOG.err(err);
                reject(err);
            } // an error occurred
            else {
                resolve(`Final state was published to SNS Topic with URL: ${state.workflow.workflow[state.currentStep].finishQueue.queueUrl}`);
            }           // successful response
        });
    })
};

const triggerLambda = (state, LOG) => {
    return new Promise((resolve, reject) => {
        let postState = {};
        Object.assign(postState, state);
        postState.currentStep = state.nextStep;
        delete postState.nextStep;
        delete postState.workflow;

        const postData = JSON.stringify({workflowState: postState});
        const options = {
            hostname: state.workflow.workflow[state.nextStep].functionEndpoint.hostname,
            path: state.workflow.workflow[state.nextStep].functionEndpoint.path,
            method: 'POST',
            headers: {
                // By default, the Invoke API assumes RequestResponse invocation type.
                // You can optionally request asynchronous execution by specifying Event as the InvocationType.
                'X-Amz-Invocation-Type': 'Event',
                'X-Amz-Log-Type': 'None',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        let req = https.request(options, (res) => {
            const uuid = state.executionUuid;
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                resolve(`Next step (${state.nextStep} was triggered for workflow: ${state.workflowName}, execution uuid: ${uuid}`);
            });
        });

        req.on('error', (err) => {
            const uuid = state.executionUuid;
            LOG.log(`Next step (${state.nextStep}) returned with error for workflow: ${state.workflowName}, execution uuid: ${uuid}: ${err.message}`);
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};


const triggerOpenWhisk = (state, security, LOG) => {
    return new Promise((resolve, reject) => {
        let postState = {};
        Object.assign(postState, state);
        postState.currentStep = state.nextStep;
        delete postState.nextStep;
        delete postState.workflow;

        const postData = JSON.stringify({workflowState: postState});
        const auth = 'Basic ' + Buffer.from(security.openWhisk.owApiAuthKey + ':' + security.openWhisk.owApiAuthPassword).toString('base64');
        const options = {
            hostname: state.workflow.workflow[state.nextStep].functionEndpoint.hostname,
            path: state.workflow.workflow[state.nextStep].functionEndpoint.path + "?blocking=false",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': auth
            }
        };

        let req = https.request(options, (res) => {
            const uuid = state.executionUuid;
            res.setEncoding('utf8');
            // res.resume();
            let data = ": ";
            res.on('data', (chunk) => {
                data += chunk
            });
            res.on('end', () => {
                resolve(`Next step (${state.nextStep}) was triggered for workflow: ${state.workflowName}, execution uuid: ${uuid} ${data}`);
            });
        });

        req.on('error', (err) => {
            const uuid = state.executionUuid;
            LOG.log(`Next step (${state.nextStep}) returned with error for workflow: ${state.workflowName}, execution uuid: ${uuid}: ${err.message}`);
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};

exports.triggerNext = triggerNext;