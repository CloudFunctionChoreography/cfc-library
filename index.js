'use strict';

const parser = require('./parser');
const state = require('./state');
const stepExecutor = require('./step-executor');
const hinting = require('./hinting')
const Logger = require('./logger');
const uuidv1 = require('uuid/v1');
let functionInstanceUuid;
let workflows;

const handleCfc = (params, options, handler) => {

    const HINT_BLOCKING_TIME = 0;


    return new Promise((resolve, reject) => {
        // check if request was hint request
        if (params.hintFlag) { // TODO request is hint
            // check if this is a warm or cold execution
            if (functionInstanceUuid) { // warm: immediately resolve
                console.log(`Received hint, but instance was already warm --> immediate return. Instance ID: ${functionInstanceUuid}`);
                resolve({message: `Received hint, but instance was already warm --> immediate return. Instance ID: ${functionInstanceUuid}`})
            } else { // cold: wait for a certain time and resolve
                let waitTill = new Date(new Date().getTime() + HINT_BLOCKING_TIME);
                while (waitTill > new Date()) {
                }
                functionInstanceUuid = uuidv1();
                console.log(`Received hint and new instance started, instance ID: ${functionInstanceUuid}`)
                resolve({message: `Received hint and new instance started, instance ID: ${functionInstanceUuid}`})
            }
        } else { // request was no hint: normal execution
            executeWorkflowStep(params, options, handler).then(response => {
                resolve(response)
            }).catch(error => {
                reject(error)
            })
        }
    })
};

const sendHints = (optimization, wfState, security, LOG) => {
    return new Promise((resolve, reject) => {
        if (!functionInstanceUuid) {
            LOG.log("Runtime cold execution");
            functionInstanceUuid = uuidv1();
            if(optimization === 1) { // naive hinting
                LOG.log("User selected naive optimization mechanism --> sending hints");
                hinting.sendHints(wfState, security, LOG).then(hintingResults => {
                    resolve(hintingResults)
                }).catch(hintingErrors => {
                    reject(hintingErrors)
                });
            } else {
                resolve("User selected no optimization mechanism --> No hints send")
            }
        } else {
            LOG.log("Runtime warm execution --> No hints sent");
            resolve(`Instance was warm already --> No hints send`);
        }
    })
};

const executeWorkflowStep = (params, options, handler) => {
    /** If workflows haven't been read from file already, we do it here (this is only done in case of cold starts).
     Afterwards, the actual handler will be called. **/
    let {functionExecitionId, stateProperties, workflowsLocation, security, optimization} = options;

    return new Promise((resolve, reject) => {
        const LOG = new Logger();
        parser.parse(workflowsLocation, LOG).then(parsedWorkflows => {
            workflows = parsedWorkflows;
            let workflowStateParams;
            if (params.workflowState) workflowStateParams = params.workflowState;
            let wfState = state.createState(workflowStateParams, functionExecitionId, workflows, stateProperties, LOG);


            let hintingPromise = sendHints(optimization, wfState, security, LOG);
            hintingPromise.then(hintingResult => { // TODO promise wo anders auflösen
                LOG.log(hintingResult);
            }).catch(err => {
                LOG.err(err);
            });


            // The handler can either return directly, or return a promise and resolve its result later
            let output = handler(wfState.getThisStepInput());
            if (typeof output.then === "function") {
                // In this case the handler returns a promise
                output.then(handlerResult => {
                    LOG.log(`Promise handler result: ${JSON.stringify(handlerResult)}`);
                    wfState.setResults(handlerResult, LOG);
                    stepExecutor.triggerNext(wfState, security, LOG).then(nextStepRequest => {
                        LOG.log(nextStepRequest);
                        let wfStateCopy = {};
                        Object.assign(wfStateCopy, wfState, {logs: LOG.logs});
                        delete wfStateCopy.workflow;
                        LOG.log(`LOG_WORKFLOW_STATE:${JSON.stringify(wfStateCopy)}`);
                        resolve(wfState);
                    }).catch(err => {
                        LOG.err(err);
                        reject(err);
                    });
                });
            } else {
                LOG.log(`Synchronous handler result: ${JSON.stringify(output)}`);
                wfState.setResults(output, LOG);

                stepExecutor.triggerNext(wfState, security, LOG).then(nextStepRequest => {
                    LOG.log(nextStepRequest);
                    let wfStateCopy = {};
                    Object.assign(wfStateCopy, wfState, {logs: LOG.logs});
                    delete wfStateCopy.workflow;
                    LOG.log(`LOG_WORKFLOW_STATE:${JSON.stringify(wfStateCopy)}`);
                    resolve(wfState);
                }).catch(nextStepRequestError => {
                    LOG.err(nextStepRequestError);
                    reject(nextStepRequestError);
                });
            }
        }).catch(err => {
            reject(err);
        });
    });
}

exports.executeWorkflowStep = handleCfc;