'use strict';
const util = require('./util');

const sendReportToStateMonitor = (wfState, functionInstanceUuid, timeMetrics, functionExecutionId, wasCold, security) => {
    const hostname = wfState.stateMonitorIp;
    const port = "8080";
    const path = "/stepExecution"; // TODO declare cfc-stateMonitor endpoint and port in workflow.json or initial state
    return new Promise((resolve, reject) => {
        let postObject = {
            workflowName: wfState.workflowName,
            stepName: wfState.currentStep,
            workflowExecutionUuid: wfState.executionUuid,
            stepExecutionUuid: functionExecutionId,
            instanceUuid: functionInstanceUuid,
            coldExecution: wasCold,
            optimizationMode: wfState.optimizationMode
        };

        let unknownProvider = false;
        if (wfState.workflow.workflow[wfState.currentStep].provider === 'aws' || wfState.workflow.workflow[wfState.currentStep].provider === 'openWhisk') {
            postObject = Object.assign({timeMetrics: timeMetrics}, postObject)
        } else {
            unknownProvider = true;
            console.log("Unknown provider");
            reject(`Unknown provider ${wfState.workflow.workflow[wfState.currentStep].provider}`)
        }

        if (!unknownProvider) {
            util.postCfcMonitor(hostname, path, port, security, postObject, false).then(postResult => {
                resolve(postResult)
            }).catch(postError => {
                reject(postError)
            })
        }
    });
};

const sendHintsHeuristicProviderSeperation = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
        const blockTime = wfState.currentStep === wfState.workflow.startAt ? 700 : 0; // TODO this should depend on whether the second step is AWS or OpenWhisk and if step1 is the same or the other one respectively
        let promises = [];
        const steps = wfState.workflow.workflow;
        const currentStep = wfState.workflow.workflow[wfState.currentStep];
        const currentProvider = currentStep.provider;
        let stepsOfOtherProvider = [];
        for (let stepName in wfState.workflow.workflow) {

            let postObject = {
                hintMessage: {
                    triggeredFrom: {
                        functionExecutionId: functionExecutionId,
                        functionInstanceUuid: functionInstanceUuid,
                        step: wfState.currentStep,
                        wfState: wfState.executionUuid
                    },
                    optimizationMode: wfState.optimizationMode,
                    stepName: stepName,
                    hintProxy: false,
                    workflowName: wfState.workflowName
                }
            };

            if (steps[stepName].provider === currentProvider && wfState.currentStep === wfState.workflow.startAt && stepName !== wfState.workflow.startAt) { // Send hints to functions which belong to own provider
                if (steps[stepName].provider === "openWhisk") {
                    promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, false, blockTime))
                } else if (steps[stepName].provider === "aws") {
                    promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, false, blockTime))
                }
            } else if (steps[stepName].provider !== currentProvider && wfState.currentStep === wfState.workflow.startAt && stepName !== wfState.workflow.startAt) { // Send special hint to proxy
                stepsOfOtherProvider.push(Object.assign({stepName: stepName}, steps[stepName]));
            }
        }

        /** Start: Sending special proxy-hint to one random function of the other provider **/
        if (stepsOfOtherProvider.length > 0) {
            let randomIndex = Math.floor(Math.random() * stepsOfOtherProvider.length);
            console.log(`sending proxy hint to ${stepsOfOtherProvider[randomIndex].provider} ${stepsOfOtherProvider[randomIndex].stepName} ${stepsOfOtherProvider[randomIndex].functionEndpoint.path} function`);
            let postObject = {
                hintMessage: {
                    triggeredFrom: {
                        functionExecutionId: functionExecutionId,
                        functionInstanceUuid: functionInstanceUuid,
                        step: wfState.currentStep,
                        wfState: wfState.executionUuid
                    },
                    optimizationMode: wfState.optimizationMode,
                    stepName: stepsOfOtherProvider[randomIndex].stepName,
                    hintProxy: true,
                    workflowName: wfState.workflowName,
                    provider: stepsOfOtherProvider[randomIndex].provider
                }
            };
            if (stepsOfOtherProvider[randomIndex].provider === "openWhisk") {
                promises.push(util.hintOpenWhisk(stepsOfOtherProvider[randomIndex].functionEndpoint.hostname, stepsOfOtherProvider[randomIndex].functionEndpoint.path, security, postObject, false, blockTime))
            } else if (stepsOfOtherProvider[randomIndex].provider === "aws") {
                promises.push(util.hintLambda(stepsOfOtherProvider[randomIndex].functionEndpoint.hostname, stepsOfOtherProvider[randomIndex].functionEndpoint.path, security, postObject, false, blockTime))
            }
        }
        /** End: Sending special proxy-hint to one random function of the other provider **/

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        });
    })
};

const sendHintsHeuristic = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
        let promises = [];
        const steps = wfState.workflow.workflow;
        let blocking = (wfState.currentStep === wfState.workflow.startAt) ? true : false;
        for (let stepName in wfState.workflow.workflow) {
            let postObject = {
                hintMessage: {
                    triggeredFrom: {
                        functionExecutionId: functionExecutionId,
                        functionInstanceUuid: functionInstanceUuid,
                        step: wfState.currentStep,
                        wfState: wfState.executionUuid
                    },
                    optimizationMode: wfState.optimizationMode,
                    stepName: stepName,
                    hintProxy: false,
                    workflowName: wfState.workflowName
                }
            };

            const blockTime = 0;
            // the first function in the workflow is waiting for the hint to return. The subsequent functions are not waiting

            if (wfState.currentStep === wfState.workflow.startAt && stepName !== wfState.workflow.startAt) {
                if (steps[stepName].provider === "openWhisk") {
                    promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, blocking, blockTime));
                    blocking = false;
                } else if (steps[stepName].provider === "aws") {
                    promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, blocking, blockTime));
                    blocking = false;
                }
            }
        }

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        });
    })
};

const sendHintsNaive = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
        let promises = [];
        const steps = wfState.workflow.workflow;
        for (let stepName in wfState.workflow.workflow) {
            if (steps[stepName].provider === "openWhisk" && wfState.workflow.startAt !== stepName) {
                let postObject = {
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
                };
                promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, false, 0))
            } else if (steps[stepName].provider === "aws" && wfState.workflow.startAt !== stepName) {
                let postObject = {
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
                };
                promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject, false, 0))
            }
        }

        Promise.all(promises).then(hintingResults => {
            resolve("Sending naive hints")
        }).catch(hintingErrors => {
            reject(hintingErrors)
        })
    })
};

exports.sendHintsHeuristicProviderSeperation = sendHintsHeuristicProviderSeperation;
exports.sendHintsHeuristic = sendHintsHeuristic;
exports.sendHintsNaive = sendHintsNaive;
exports.sendReportToStateMonitor = sendReportToStateMonitor;