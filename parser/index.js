'use strict';

const fs = require('fs');

let parsedWorkflows;
const parse = (workflowJsonLocation, LOG) => {
    /** If workflows haven't been read from file already, we do it here
     * (this is only done in case of cold starts). **/
    return new Promise((resolve, reject) => {
        if (!parsedWorkflows) {
            fs.readFile(workflowJsonLocation, 'utf8', (err, data) => {
                    if (err) {
                        LOG.log(err);
                        reject(err);
                    } else {
                        parsedWorkflows = JSON.parse(data).workflows;
                        LOG.log("Runtime cold execution");
                        resolve(parsedWorkflows);
                    }
                }
            );
        } else {
            LOG.log("Runtime warm execution");
            resolve(parsedWorkflows);
        }
    });
};

exports.parse = parse;
exports.parsedWorkflows = parsedWorkflows;