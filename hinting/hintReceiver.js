'use strict';
const parser = require('./../parser');
const uuidv1 = require('uuid/v1');
const Logger = require('./../logger');
const util = require('./util');


const HINT_BLOCKING_TIME = 0;

const handleModeHeuristic = (options, functionInstanceUuid, hintMessage, params) => {
    return new Promise((resolve, reject) => {
        let {functionExecutionId, workflowsLocation, security} = options;
        const LOG = new Logger();


        parser.parse(workflowsLocation, LOG).then(parsedWorkflows => {
            let workflow;
            for (let workflowObject of parsedWorkflows) {
                if (workflowObject.name === hintMessage.workflowName) workflow = workflowObject;
            }

            // check if this is a warm or cold execution
            if (functionInstanceUuid) { // warm: recursive self hinting
                let workflowHintResult = Object.assign({
                    functionInstanceUuid: functionInstanceUuid,
                    wasCold: 0,
                    functionExecutionId: functionExecutionId,
                    hintProxy: hintMessage.hintProxy
                }, params.hintMessage);
                console.log(`LOG_WORKFLOW_HINT:${JSON.stringify(workflowHintResult)}`);
                if (hintMessage.hintProxy) { // If hintProxy --> send hints
                    sendHeuristicHint(workflow, hintMessage, security, functionExecutionId, functionInstanceUuid).then(proxyHints => {
                        console.log(`PROXY_HINTS:${JSON.stringify(proxyHints)}`);
                        sendRecursiveHeuristicHint(workflow, hintMessage, security, functionExecutionId, functionInstanceUuid).then(recursiveHintingResult => {
                            console.log(`RECURSIVE HINTING RESULT: ${recursiveHintingResult}`);
                            resolve(workflowHintResult)
                        }).catch(recursiveHintingError => {
                            console.log(`RECURSIVE HINTING Error: ${recursiveHintingError}`);
                            reject(recursiveHintingError)
                        })
                    }).catch(proxyError => {
                        reject(proxyError)
                    });
                } else {
                    sendRecursiveHeuristicHint(workflow, hintMessage, security, functionExecutionId, functionInstanceUuid).then(recursiveHintingResult => {
                        console.log(`RECURSIVE HINTING RESULT: ${recursiveHintingResult}`);
                        resolve(workflowHintResult)
                    }).catch(recursiveHintingError => {
                        console.log(`RECURSIVE HINTING Error: ${recursiveHintingError}`);
                        reject(recursiveHintingError)
                    })
                }
            } else { // cold: return
                let functionInstanceUuid = uuidv1();
                let workflowHintResult = Object.assign({
                    functionInstanceUuid: functionInstanceUuid,
                    wasCold: 1,
                    functionExecutionId: functionExecutionId,
                    hintProxy: hintMessage.hintProxy
                }, params.hintMessage);
                console.log(`LOG_WORKFLOW_HINT:${JSON.stringify(workflowHintResult)}`);

                if (hintMessage.hintProxy) {
                    sendHeuristicHint(workflow, hintMessage, security, functionExecutionId, functionInstanceUuid).then(proxyHints => {
                        console.log(`PROXY_HINTS:${JSON.stringify(proxyHints)}`);
                        resolve(workflowHintResult)
                    }).catch(proxyError => {
                        reject(proxyError)
                    });
                } else {
                    resolve(workflowHintResult)
                }
            }
        }).catch(parserError => {
            reject(parserError)
        });
    })
};

const sendRecursiveHeuristicHint = (workflow, hintMessage, security, functionExecutionId, functionInstanceUuid) => {
    return new Promise((resolve, reject) => {
        const MAX_RECURSIVE_HINTS = 3;
        const currentStep = hintMessage.stepName;
        const steps = workflow.workflow;
        let hintCounter = hintMessage.recursiveHintCounter;
        if (!hintCounter) hintCounter = 0;

        if (hintCounter < MAX_RECURSIVE_HINTS) {
            let postObject = {
                hintMessage: {
                    triggeredFrom: {
                        functionExecutionId: functionExecutionId,
                        functionInstanceUuid: functionInstanceUuid,
                        step: currentStep,
                        wfState: hintMessage.triggeredFrom.wfState
                    },
                    optimizationMode: hintMessage.optimizationMode,
                    stepName: currentStep,
                    hintProxy: false,
                    recursiveHintCounter: hintCounter + 1,
                    workflowName: workflow.name
                }
            };

            let promise;
            if (steps[currentStep].provider === "openWhisk") {
                promise = util.hintOpenWhisk(steps[currentStep].functionEndpoint.hostname, steps[currentStep].functionEndpoint.path, security, postObject, false, 0, true)
            } else if (steps[currentStep].provider === "aws") {
                promise = util.hintLambda(steps[currentStep].functionEndpoint.hostname, steps[currentStep].functionEndpoint.path, security, postObject, false, 0, true)
            }

            promise.then(recursiveHintResult => {
                setTimeout(() => {
                    resolve(recursiveHintResult)
                }, ((MAX_RECURSIVE_HINTS - hintCounter) * recursiveHintResult.connectTime)) // important blocking
            }).catch(recursiveHintError => {
                reject(recursiveHintError)
            })
        } else {
            resolve(hintCounter)
        }
    });
};

const sendHeuristicHint = (workflow, hintMessage, security, functionExecutionId, functionInstanceUuid) => {
    return new Promise((resolve, reject) => {
        const currentStep = hintMessage.stepName;
        const currentProvider = hintMessage.provider;
        const steps = workflow.workflow;

        let promises = [];

        for (let stepName in steps) {

            let postObject = {
                hintMessage: {
                    triggeredFrom: {
                        functionExecutionId: functionExecutionId,
                        functionInstanceUuid: functionInstanceUuid,
                        step: currentStep,
                        wfState: hintMessage.triggeredFrom.wfState
                    },
                    optimizationMode: hintMessage.optimizationMode,
                    stepName: stepName,
                    hintProxy: false,
                    workflowName: workflow.name
                }
            };

            if (steps[stepName].provider === currentProvider && stepName !== currentStep) { // Send hints to functions which belong to own provider
                if (steps[stepName].provider === "openWhisk") {
                    promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
                } else if (steps[stepName].provider === "aws") {
                    promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
                }
            }
        }

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        })
    });


};


const handleHintMessage = (functionInstanceUuid, hintMessage, options, params) => {

    return new Promise((resolve, reject) => {
        if (hintMessage.optimizationMode === 3) {
            handleModeHeuristic(options, functionInstanceUuid, hintMessage, params).then(heuristicResult => {
                resolve(heuristicResult)
            }).catch(heuristicError => {
                reject(heuristicError)
            });
        } else {
            const {functionExecutionId} = options;
            // check if this is a warm or cold execution
            if (functionInstanceUuid) { // warm: immediately resolve
                let workflowHintResult = Object.assign({
                    functionInstanceUuid: functionInstanceUuid,
                    wasCold: 0,
                    functionExecutionId: functionExecutionId
                }, params.hintMessage);
                console.log(`LOG_WORKFLOW_HINT:${JSON.stringify(workflowHintResult)}`);
                resolve(workflowHintResult)
            } else { // cold: wait for a certain time and resolve
                setTimeout(() => {
                    let functionInstanceUuid = uuidv1();
                    let workflowHintResult = Object.assign({
                        functionInstanceUuid: functionInstanceUuid,
                        wasCold: 1,
                        functionExecutionId: functionExecutionId
                    }, params.hintMessage);
                    console.log(`LOG_WORKFLOW_HINT:${JSON.stringify(workflowHintResult)}`);
                    resolve(workflowHintResult)
                }, HINT_BLOCKING_TIME);
            }
        }
    })
};

exports.handleHintMessage = handleHintMessage;