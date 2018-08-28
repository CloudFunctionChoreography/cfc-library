'use strict';

const uuidv1 = require('uuid/v1');


const handleHintMessage = (functionInstanceUuid, hintMessage, options, params) => {
    const HINT_BLOCKING_TIME = 0;

    return new Promise((resolve, reject) => {
        if (hintMessage.optimizationMode === 3) {
            const {functionExecutionId} = options;
            // check if this is a warm or cold execution
            if (functionInstanceUuid) { // warm: immediately resolve
                //TODO recursive self hinting AND If hintProxy --> send hints
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