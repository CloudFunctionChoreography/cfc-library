'use strict';

const parser = require('./parser');
const state = require('./state');
const stepExecutor = require('./step-executor');
const hinting = require('./hinting');
const Logger = require('./logger');
const uuidv1 = require('uuid/v1');
const Time = require('./time');
let functionInstanceUuid;
let workflows;


const handleCfc = (params, options, context, handler) => {
    return new Promise((resolve, reject) => {
        // check if request was hint request
        if (params.hintMessage) { // request is hint
            hinting.handleHintMessage(functionInstanceUuid, params.hintMessage, options, params).then(hintResult => {
                if (hintResult.functionInstanceUuid) functionInstanceUuid = hintResult.functionInstanceUuid;
                resolve(hintResult)
            }).catch(hintError => {
                reject(hintError)
            });
        } else { // request was no hint: normal execution
            parseAndExecute(params, options, context, handler).then(response => {
                resolve(response)
            }).catch(error => {
                reject(error)
            })
        }
    })
};

const executeWorkflowStep = (options, handler, LOG, wfState) => {

    return new Promise((resolve, reject) => {

        let {functionExecutionId, security} = options;


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
                    Time.setEndTime(functionExecutionId);
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
                Time.setEndTime(functionExecutionId);
                resolve(wfState);
            }).catch(nextStepRequestError => {
                LOG.err(nextStepRequestError);
                reject(nextStepRequestError);
            });
        }
    })
};

const parseAndExecute = (params, options, context, handler) => {
    /**
     * Start: Getting time metrics right at the start of the execution
     */
    let timeMetrics = {
        startTime: null,
        endTime: Time.getEndTime()
    };
    Time.resetEndTime();
    if (typeof context.getRemainingTimeInMillis === "function") { // context is from AWS Lambda
        timeMetrics.remainingTimeAtStart = context.getRemainingTimeInMillis();
        timeMetrics.executionTimeLimit = 30000; // TODO make it dynamic
    }

    let getStartTime = Time.getTime().then(startTime => {
        timeMetrics.startTime = startTime;

        return new Promise((resolve) => {
            resolve(startTime)
        })
    });
    /**
     * End: Getting time metrics right at the start of the execution
     */


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

            /** Begin: Send Report **/
            let reportAndHintingPromise = [];
            if (wfState.sendReports === 1 || wfState.optimizationMode === 5) {
                let reportPromise = new Promise((resolve1, reject1) => {
                    if (timeMetrics.startTime === null) {
                        getStartTime.then(startTime => {
                            timeMetrics.startTime = startTime;
                            hinting.sendReportToCfcStateMonitor(wfState, functionExecutionId, timeMetrics, security, functionInstanceUuid, coldExecution, LOG)
                                .then(value => resolve1(value))
                                .catch(reason => {
                                    reject1(reason)
                                });
                        }).catch(reason => reject1(reason))
                    } else {
                        hinting.sendReportToCfcStateMonitor(wfState, functionExecutionId, timeMetrics, security, functionInstanceUuid, coldExecution, LOG)
                            .then(value => resolve1(value))
                            .catch(reason => {
                                reject1(reason)
                            });
                    }
                });
                reportAndHintingPromise.push(reportPromise);
            }
            /** End: Send Report **/

            /**
             * Begin: Send hints when cold execution
             */
            if (coldExecution) { // cold execution: send hints
                reportAndHintingPromise.push(hinting.sendHints(wfState, functionExecutionId, security, functionInstanceUuid, LOG));
            }
            /**
             * END: Sending hints when cold execution
             */

            // the order of the promise all results is same as order of the promises, regardless of what resolves first
            const workflowResultIndex = reportAndHintingPromise.push(executeWorkflowStep(options, handler, LOG, wfState)) - 1;
            Promise.all(reportAndHintingPromise).then(result => {
                // console.log(`InitLatency: ${new Date().getTime() - start}`)
                // console.log(reportAndHintingResult);
                resolve(result[workflowResultIndex]);
            }).catch(err => {
                LOG.err(err);
                reject(err)
            });
        }).catch(err => {
            reject(err);
        });
    });
};

exports.executeWorkflowStep = handleCfc;