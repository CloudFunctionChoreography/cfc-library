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
    return new Promise((resolve, reject) => {
        // check if request was hint request
        if (params.hintMessage) { // request is hint
            hinting.handleHintMessage(functionInstanceUuid, options, params).then(hintResult => {
                if (hintResult.functionInstanceUuid) functionInstanceUuid = hintResult.functionInstanceUuid;
                resolve(hintResult)
            }).catch(hintError => {
                reject(hintError)
            });
        } else { // request was no hint: normal execution
            executeWorkflowStep(params, options, handler).then(response => {
                resolve(response)
            }).catch(error => {
                reject(error)
            })
        }
    })
};

const sendHints = (wfState, functionExecutionId, security, LOG) => {
    return new Promise((resolve, reject) => {
        if (wfState.optimizationMode === 1) { // naive hinting: if first function in workflow receives request and is cold, it hints all others
            if (wfState.currentStep === wfState.workflow.startAt) { // this function is executed as first step in workflow
                LOG.log("User selected naive optimization mechanism --> First function is sending hints");
                hinting.sendHints(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => {
                    resolve(hintingResults)
                }).catch(hintingErrors => {
                    reject(hintingErrors)
                });
            } else { // This function is not executed as first step in workflow
                resolve(`User selected naive optimization mechanism, but this function is executed as step ${wfState.currentStep} instead of first step (${wfState.workflow.startAt}) in the workflow --> No hints send`)
            }
        } else if (wfState.optimizationMode === 2) { // naive hinting v2: every function that is cold when it receives a request sends a hint
            // Note: It can happen that the first function of the workflow already send hints to all others,
            // but step 2 gets executed as cold because the hint was not processed yet. Then function2 will
            // send hints again for the same workflow execution.
            LOG.log("User selected extended naive optimization mechanism (every function that is cold when it receives a request sends a hint) --> sending hints");
            hinting.sendHints(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => { //TODO change sendHints so it only sends to functions AFTER this one
                resolve(hintingResults)
            }).catch(hintingErrors => {
                reject(hintingErrors)
            });
        } else {
            resolve("User selected no optimization mechanism --> No hints send")
        }
    })
};

const executeWorkflowStep = (params, options, handler) => {
    /** If workflows haven't been read from file already, we do it here (this is only done in case of cold starts).
     Afterwards, the actual handler will be called. **/
    let {functionExecutionId, stateProperties, workflowsLocation, security} = options;

    return new Promise((resolve, reject) => {
        const LOG = new Logger();
        parser.parse(workflowsLocation, LOG).then(parsedWorkflows => {
            workflows = parsedWorkflows;
            let workflowStateParams;
            if (params.workflowState) workflowStateParams = params.workflowState;

            // If cold execution, set UUID for this function's runtime instance
            let coldExecution;
            if (!functionInstanceUuid) {
                coldExecution = true;
                functionInstanceUuid = uuidv1();
                LOG.log("Runtime cold execution");
            } else {
                coldExecution = false;
                LOG.log("Runtime warm execution --> No hints sent");
            }

            // Create current workflow state from the params and context information such as functionExecutionId and functionInstanceUuid
            let wfState = state.createState(workflowStateParams, functionExecutionId, workflows, Object.assign({
                functionInstanceUuid: functionInstanceUuid,
                coldExecution: coldExecution
            }, stateProperties), LOG);

            /**
             * Begin: Send hints when cold execution
             */
            let hintingPromise;
            if (coldExecution) {
                hintingPromise = sendHints(wfState, functionExecutionId, security, LOG);
                hintingPromise.then(hintingResult => { // TODO promise wo anders auflösen
                    // LOG.log(hintingResult);
                }).catch(err => {
                    // LOG.err(err);
                });
            }
            /**
             * END: Sending hints when cold execution
             */

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
};

exports.executeWorkflowStep = handleCfc;