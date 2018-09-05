'use strict';

const hintReceiver = require('./hintReceiver');
const hintSender = require('./hintSender');


const sendHints = (wfState, functionExecutionId, security, functionInstanceUuid, LOG) => {
    return new Promise((resolve, reject) => {
        if (wfState.optimizationMode === 1) { // naive hinting: if first function in workflow receives request and is cold, it hints all others
            if (wfState.currentStep === wfState.workflow.startAt) { // this function is executed as first step in workflow
                LOG.log("User selected naive optimization mechanism --> First function is sending hints");
                hintSender.sendHintsNaive(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => {
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
            hintSender.sendHintsNaive(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => { //TODO change sendHints so it only sends to functions AFTER this one
                resolve(hintingResults)
            }).catch(hintingErrors => {
                reject(hintingErrors)
            });
        } else if (wfState.optimizationMode === 3) { // Heuristic
            LOG.log(`User selected heuristic-based optimization approach --> sending hints to ${wfState.workflow.workflow[wfState.currentStep].provider} functions and alert function of other provider to send hints`);
            hintSender.sendHintsHeuristic(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => {
                resolve(hintingResults)
            }).catch(hintingErrors => {
                reject(hintingErrors)
            });
        } else if (wfState.optimizationMode === 4) { // Heuristic with provider separation
            LOG.log(`User selected heuristic-based optimization approach --> sending hints to ${wfState.workflow.workflow[wfState.currentStep].provider} functions and alert function of other provider to send hints`);
            hintSender.sendHintsHeuristicProviderSeperation(wfState, functionInstanceUuid, functionExecutionId, security).then(hintingResults => {
                resolve(hintingResults)
            }).catch(hintingErrors => {
                reject(hintingErrors)
            });
        } else {
            resolve("User selected no optimization mechanism --> No hints send")
        }
    })
};

const handleHintMessage = (functionInstanceUuid, hintMessage, options, params) => {
    return hintReceiver.handleHintMessage(functionInstanceUuid, hintMessage, options, params);
};


exports.sendHints = sendHints;
exports.handleHintMessage = handleHintMessage;