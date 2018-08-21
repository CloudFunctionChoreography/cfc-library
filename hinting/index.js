'use strict';
const https = require('https');
const hintReceiver = require('./hintReceiver');
const hintSender = require('./hintSender');

const sendHints = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
        let promises = [];
        const steps = wfState.workflow.workflow;
        for (let stepName in wfState.workflow.workflow) {
            if (steps[stepName].provider === "openWhisk" && wfState.workflow.startAt !== stepName) {
                promises.push(hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, wfState, functionInstanceUuid, stepName, functionExecutionId))
            } else if (steps[stepName].provider === "aws" && wfState.workflow.startAt !== stepName) {
                promises.push(hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, wfState, functionInstanceUuid, stepName, functionExecutionId))
            }
        }

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        })
    })
};

const hintLambda = (hostname, path, security, wfState, functionInstanceUuid, stepName, functionExecutionId) => {
    return new Promise((resolve, reject) => {

        const postData = JSON.stringify({
            hintMessage: {
                triggeredFrom: {
                    functionExecutionId: functionExecutionId,
                    functionInstanceUuid: functionInstanceUuid,
                    step: wfState.currentStep,
                    wfState: wfState.executionUuid
                },
                optimizationMode: wfState.optimizationMode,
                stepName: stepName
            }
        });
        const options = {
            hostname: hostname,
            path: path,
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
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                resolve(`Lambda function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};


const hintOpenWhisk = (hostname, path, security, wfState, functionInstanceUuid, stepName, functionExecutionId) => {
    return new Promise((resolve, reject) => {

        const postData = JSON.stringify({
            hintMessage: {
                triggeredFrom: {
                    functionExecutionId: functionExecutionId,
                    functionInstanceUuid: functionInstanceUuid,
                    step: wfState.currentStep,
                    wfState: wfState.executionUuid
                },
                optimizationMode: wfState.optimizationMode,
                stepName: stepName
            }
        });
        const auth = 'Basic ' + Buffer.from(security.openWhisk.owApiAuthKey + ':' + security.openWhisk.owApiAuthPassword).toString('base64');
        const options = {
            hostname: hostname,
            path: path + "?blocking=false",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': auth
            }
        };

        let req = https.request(options, (res) => {
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                resolve(`OpenWhisk function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};

exports.sendHints = sendHints;
exports.handleHintMessage = hintReceiver.handleHintMessage;