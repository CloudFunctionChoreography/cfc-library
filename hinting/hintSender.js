'use strict';
const util = require('./util');


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

exports.sendHintsNaive = sendHintsNaive;