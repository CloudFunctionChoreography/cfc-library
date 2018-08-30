'use strict';
const util = require('./util');

const sendHintsHeuristic = (wfState, functionInstanceUuid, functionExecutionId, security) => {
    return new Promise((resolve, reject) => {
        let promises = [];
        const steps = wfState.workflow.workflow;
        const currentStep = wfState.workflow.workflow[wfState.currentStep];
        const currentProvider = currentStep.provider;
        let sentHintToProxy = false;
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
                console.log(`DEBUG: steps[stepName].provider: ${steps[stepName].provider}, currentProvider: ${currentProvider}, wfState.currentStep: ${wfState.currentStep}, wfState.workflow.startAt: ${wfState.workflow.startAt} ==> ${steps[stepName].provider === currentProvider && wfState.currentStep === wfState.workflow.startAt}`)


                if (steps[stepName].provider === "openWhisk") {
                    promises.push(util.hintOpenWhisk(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
                } else if (steps[stepName].provider === "aws") {
                    promises.push(util.hintLambda(steps[stepName].functionEndpoint.hostname, steps[stepName].functionEndpoint.path, security, postObject))
                }
            } else if (steps[stepName].provider !== currentProvider && wfState.currentStep === wfState.workflow.startAt && !sentHintToProxy && stepName !== wfState.workflow.startAt) { // Send special hint to proxy
                sentHintToProxy = true;
                console.log(`sending hint to ${steps[stepName].provider} ${stepName} proxy function`);
                postObject.hintMessage.provider = steps[stepName].provider;
                postObject.hintMessage.hintProxy = true;
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