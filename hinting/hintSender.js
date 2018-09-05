'use strict';
const util = require('./util');

const sendHintsHeuristic = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
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
                    promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
                } else if (steps[stepName].provider === "aws") {
                    promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
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
                promises.push(util.hintOpenWhisk(stepsOfOtherProvider[randomIndex].functionEndpoint.hostname, stepsOfOtherProvider[randomIndex].functionEndpoint.path, security, postObject))
            } else if (stepsOfOtherProvider[randomIndex].provider === "aws") {
                promises.push(util.hintLambda(stepsOfOtherProvider[randomIndex].functionEndpoint.hostname, stepsOfOtherProvider[randomIndex].functionEndpoint.path, security, postObject))
            }
        }
        /** End: Sending special proxy-hint to one random function of the other provider **/

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        })
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
                promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
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
                promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
            }
        }

        Promise.all(promises).then(hintingResults => {
            resolve(hintingResults)
        }).catch(hintingErrors => {
            reject(hintingErrors)
        })
    })
};

exports.sendHintsHeuristic = sendHintsHeuristic;
exports.sendHintsNaive = sendHintsNaive;