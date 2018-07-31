'use strict';

const executeChoice = (workflow, currentStep, output) => {
    let choices = workflow.workflow[currentStep].choices;
    let next;
    for (let choice of choices) {
        let choiceVariable = choice.variable;
        let choiceCondition = choice.condition;
        let choiceType = choice.choiceType;
        if (choiceType === "stringEquals" && output[choiceVariable] === choiceCondition) next = choice.next;
        // TODO add other choiceTypes
    }
    if (next) return next; else return new Error("Couldn't evaluate choice condition")
};


exports.executeChoice = executeChoice;