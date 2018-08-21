'use strict';

const uuidv1 = require('uuid/v1');


const handleHintMessage = (functionInstanceUuid, options, params) => {
    return new Promise((resolve, reject) => {
        const HINT_BLOCKING_TIME = 0;
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
    })
};

exports.handleHintMessage = handleHintMessage;