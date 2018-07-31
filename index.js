'use strict';

const parser = require('./parser');
const state = require('./state');
const stepExecutor = require('./step-executor');
const Logger = require('./logger');
let workflows;

const executeWorkflowStep = (params, functionExecitionId, stateProperties, workflowsLocation, handler) => {
    /** If workflows haven't been read from file already, we do it here (this is only done in case of cold starts).
     Afterwards, the actual handler will be called. **/
    return new Promise((resolve, reject) => {
        const LOG = new Logger();
        parser.parse(workflowsLocation, LOG).then(parsedWorkflows => {
            workflows = parsedWorkflows;

            let workflowStateParams;
            if (params.workflowState) workflowStateParams = params.workflowState;

            let wfState = state.createState(workflowStateParams, functionExecitionId, workflows, stateProperties, LOG);

            // The handler can either return directly, or return a promise and resolve its result later
            let output = handler(wfState.getThisStepInput());
            if (typeof output.then === "function") {
                // In this case the handler returns a promise
                output.then(handlerResult => {
                    LOG.log(`Promise handler result: ${JSON.stringify(handlerResult)}`);
                    wfState.setResults(handlerResult, LOG);
                    stepExecutor.triggerNext(wfState, LOG).then(nextStepRequest => {
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

                stepExecutor.triggerNext(wfState, LOG).then(nextStepRequest => {
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

exports.executeWorkflowStep = executeWorkflowStep;