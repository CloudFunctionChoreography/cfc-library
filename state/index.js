'use strict';

const State = require('./state');

const createState = (workflowState, functionExecitionId, workflows, stateProperties, LOG) => {
    let workflow;
    for (let workflowObject of workflows) {
        if (workflowObject.name === workflowState.workflowName) workflow = workflowObject;
    }

    if (workflow) {
        let state = new State(workflowState, functionExecitionId, workflow, stateProperties);
        //LOG.log(`state ${JSON.stringify(state)}`);
        return state;
    } else {
        LOG.err(`Cannot find corresponding workflow for the given state: ${JSON.stringify(workflowState)}`);
        return new Error("Cannot find corresponding workflow for the given state.")
    }
};

exports.createState = createState;