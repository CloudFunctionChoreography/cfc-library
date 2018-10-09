'use strict';

const https = require('https');
const http = require('http');

const postCfcMonitor = (hostname, path, port, security, postObject, blocking) => {
    return new Promise((resolve, reject) => {
        if (!blocking) resolve(`Sending report to cfc-stateMonitor ${hostname}${path}.`);
        let start = new Date().getTime();
        const postData = JSON.stringify(postObject);
        const options = {
            hostname: hostname,
            path: path,
            port: port,
            method: 'POST',
            headers: {
                // By default, the Invoke API assumes RequestResponse invocation type.
                // You can optionally request asynchronous execution by specifying Event as the InvocationType.
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        let req = http.request(options, (res) => {
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                if (blocking) resolve(`Report was sent to cfc-stateMonitor ${hostname}${path}. Report latency ${new Date().getTime() - start}ms`);
            });
        });

        req.on('error', (err) => {
            console.log(`Report was sent to cfc-stateMonitor ${hostname}${path} BUT error: ${err.message}`);
            if (blocking) reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    });
};

const hintLambda = (hostname, path, security, postObject, blocking = false, blockTime = 0) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (!blocking) resolve(`Sending hint to Lambda function ${hostname}${path}.`);
        }, blockTime);

        let invocationType = "Event";
        if (blocking) invocationType = "RequestResponse";


        const postData = JSON.stringify(postObject);
        const options = {
            hostname: hostname,
            path: path,
            method: 'POST',
            headers: {
                // By default, the Invoke API assumes RequestResponse invocation type.
                // You can optionally request asynchronous execution by specifying Event as the InvocationType.
                'X-Amz-Invocation-Type': invocationType,
                'X-Amz-Log-Type': 'None',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        let req = https.request(options, (res) => {
            res.setEncoding('utf8');
            res.resume();
            res.on('end', () => {
                console.log(`Lambda function was hinted ${hostname}${path}`);
                if (blocking) resolve(`Lambda function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            console.log(`Lambda function was hinted BUT error: ${err.message}`);
            if (blocking) reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};


const hintOpenWhisk = (hostname, path, security, postObject, blocking = false, blockTime = 0) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (!blocking) resolve(`Sending hint to OpenWhisk function ${hostname}${path}.`);
        }, blockTime);

        let blockingPath = "?blocking=false"
        if (blocking) blockingPath = "?blocking=true"

        const postData = JSON.stringify(postObject);
        const auth = 'Basic ' + Buffer.from(security.openWhisk.owApiAuthKey + ':' + security.openWhisk.owApiAuthPassword).toString('base64');
        const options = {
            hostname: hostname,
            path: path + blockingPath,
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
                console.log(`OpenWhisk function was hinted ${hostname}${path}`);
                if (blocking) resolve(`OpenWhisk function was hinted ${hostname}${path}`);
            });
        });

        req.on('error', (err) => {
            console.log(`OpenWhisk function was hinted BUT error: ${err.message}`);
            if (blocking) reject(err);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};

exports.hintOpenWhisk = hintOpenWhisk;
exports.hintLambda = hintLambda;
exports.postCfcMonitor = postCfcMonitor;