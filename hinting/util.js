'use strict';

const https = require('https');

const hintLambda = (hostname, path, security, postObject) => {
    return new Promise((resolve, reject) => {

        const postData = JSON.stringify(postObject);
        const options = {
            hostname: hostname,
            path: path,
            method: 'POST',
            headers: {
                // By default, the Invoke API assumes RequestResponse invocation type.
                // You can optionally request asynchronous execution by specifying Event as the InvocationType.
                'X-Amz-Invocation-Type': 'Event',
                'X-Amz-Log-Type': 'None',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        let req = https.request(options, (res) => {
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                resolve(`Lambda function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};


const hintOpenWhisk = (hostname, path, security, postObject) => {
    return new Promise((resolve, reject) => {

        const postData = JSON.stringify(postObject);
        const auth = 'Basic ' + Buffer.from(security.openWhisk.owApiAuthKey + ':' + security.openWhisk.owApiAuthPassword).toString('base64');
        const options = {
            hostname: hostname,
            path: path + "?blocking=false",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': auth
            }
        };

        let req = https.request(options, (res) => {
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                resolve(`OpenWhisk function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};

exports.hintOpenWhisk = hintOpenWhisk;
exports.hintLambda = hintLambda;