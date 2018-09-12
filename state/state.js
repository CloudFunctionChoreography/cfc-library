'use strict';
const choiceValidator = require('./choice-validator');
const uuidv1 = require('uuid/v1');

class State {
    constructor(workflowState, functionExecutionId, workflow, stateProperties) {
        this.workflowName = workflowState.workflowName;


        if (workflowState.currentStep && workflowState.currentStep !== "" &&
            workflowState.executionUuid && workflowState.executionUuid !== "") { // workflow already started and this is not first step
            this.currentStep = workflowState.currentStep;
            this.executionUuid = workflowState.executionUuid;
            this.excutionHistory = [...workflowState.excutionHistory, {
                step: this.currentStep,
                functionExecutionId: functionExecutionId,
                provider: workflow.workflow[this.currentStep].provider,
                stateProperties: stateProperties
            }];
        } else { // new workflow execution
            this.currentStep = workflow.startAt;
            this.executionUuid = uuidv1();
            this.excutionHistory = [{
                step: this.currentStep,
                functionExecutionId: functionExecutionId,
                provider: workflow.workflow[this.currentStep].provider,
                stateProperties: stateProperties
            }];
        }
        this.sendReports = workflowState.sendReports ? workflowState.sendReports : 0;
        this.optimizationMode = workflowState.optimizationMode ? workflowState.optimizationMode : 0;
        this.results = workflowState.results ? workflowState.results : {inputs: {}, outputs: {}};
        this.fail = {message: null, failState: false};
        this.workflow = workflow;
        this.nextStep = null;
    }

    setResults(output, LOG) {
        // create inputPath and resultPath in the inputs and outputs respectively to the workflows.json
        this.setNextStep(output, LOG);
        LOG.log(`Next step will be ${this.nextStep} for executionUuid ${this.executionUuid}`);
        if (this.nextStep) {
            let inputObject = {};
            inputObject[this.workflow.workflow[this.nextStep].inputPath] = output;
            Object.assign(this.results.inputs, inputObject);
        }

        let outputObject = {};
        outputObject[this.workflow.workflow[this.currentStep].resultPath] = output;
        Object.assign(this.results.outputs, outputObject);
    }

    getResults() {
        return this.results;
    }

    getThisStepInput() {
        return this.results.inputs[this.workflow.workflow[this.currentStep].inputPath];
    }

    getThisStepOutput() {
        return this.results.outputs[this.workflow.workflow[this.currentStep].resultPath];
    }

    setNextStep(output, LOG) {
        let nextStep = null;
        if (!(this.workflow.workflow[this.currentStep].end === true || this.workflow.workflow[this.currentStep].end === "true")) {
            switch (this.workflow.workflow[this.currentStep].type) {
                case "ChoiceTask":
                    LOG.log("Evaluating next handler for ChoiceTask");
                    let next = choiceValidator.executeChoice(this.workflow, this.currentStep, output);
                    if (!(next instanceof Error)) nextStep = next; else return next;
                    break;
                case "Task":
                    LOG.log("Evaluating next handler for Task");
                    nextStep = this.workflow.workflow[this.currentStep].next;
                    break;
                case "Fail":
                    LOG.log("Current step is in Fail state which is always end state");
                    this.fail.message = `Current step ${this.currentStep} is type Fail`;
                    this.fail.failState = true;
                    nextStep = null;
                    break;
                default:
                    return new Error("Couldn't parse workflow step");
            }
        }

        this.nextStep = nextStep;
    }
}

module.exports = State;