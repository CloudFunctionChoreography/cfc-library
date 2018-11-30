'use strict';

const https = require('https');
const http = require('http');

const postCfcMonitor = (hostname, path, port, security, postObject) => {
    return new Promise((resolve, reject) => {
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
                console.log("Report latency: " + new Date().getTime() - start);
                resolve(`Report was sent to cfc-stateMonitor ${hostname}${path}. Report latency ${new Date().getTime() - start}ms`);
            });
        });

        req.on('error', (err) => {
            console.log(`Report was sent to cfc-stateMonitor ${hostname}${path} BUT error: ${err.message}`);
            reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    });
};

const hintLambda = (hostname, path, security, postObject, blocking = false, blockTime = 0, connectTime = false) => {
    return new Promise((resolve, reject) => {
        let now = new Date().getTime();
        let timings = {dnsLookupAt: -1, tcpConnectionAt: -1, tlsHandshakeAt: -1};


        setTimeout(() => {
            if (!blocking && !connectTime) resolve(`Sending hint to Lambda function ${hostname}${path}.`);
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
            let result = "";
            res.on('data', chunk => {
                result = result + chunk;
            });
            res.on('end', () => {
                console.log(`Lambda function was hinted ${hostname}${path}`);
                if (blocking) {
                    resolve({
                        message: `Lambda function was hinted ${hostname}${path}`,
                        response: JSON.parse(JSON.parse(result).body).handlerResult,
                        connectTime: Math.max(timings.dnsLookupAt, timings.tcpConnectionAt, timings.tlsHandshakeAt)
                    });
                } else if (connectTime) {
                    resolve({
                        message: `Lambda function was hinted ${hostname}${path}`,
                        connectTime: Math.max(timings.dnsLookupAt, timings.tcpConnectionAt, timings.tlsHandshakeAt)
                    });
                }
            });
        });

        req.on('socket', socket => {
            socket.on('lookup', () => {
                timings.dnsLookupAt = new Date().getTime() - now;
            });
            socket.on('connect', () => {
                timings.tcpConnectionAt = new Date().getTime() - now;
            });
            socket.on('secureConnect', () => {
                timings.tlsHandshakeAt = new Date().getTime() - now;
            });
        });

        req.on('error', (err) => {
            console.log(`Lambda function was hinted BUT error: ${err.message}`);
            if (blocking || connectTime) reject(err.message);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};


const hintOpenWhisk = (hostname, path, security, postObject, blocking = false, blockTime = 0, connectTime = false) => {
    return new Promise((resolve, reject) => {
        let now = new Date().getTime();
        let timings = {dnsLookupAt: -1, tcpConnectionAt: -1, tlsHandshakeAt: -1};

        setTimeout(() => {
            if (!blocking && !connectTime) resolve(`Sending hint to OpenWhisk function ${hostname}${path}.`);
        }, blockTime);

        let blockingPath = blocking ? "?blocking=true" : "?blocking=false";

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
            let result = "";
            res.on('data', chunk => {
                result = result + chunk;
            });
            res.on('end', () => {
                console.log(`OpenWhisk function was hinted ${hostname}${path}`);
                if (blocking) {
                    let hintResult = {
                        message: `OpenWhisk function was hinted ${hostname}${path}`,
                        response: null,
                        connectTime: Math.max(timings.dnsLookupAt, timings.tcpConnectionAt, timings.tlsHandshakeAt)
                    };
                    if (JSON.parse(result).response) {
                        hintResult.response = JSON.parse(result).response.result;
                    } else {
                        console.log(`Error from ${hostname}${path + blockingPath} Hint: ${result}`)
                    }
                    resolve(hintResult);
                } else if (connectTime) {
                    resolve({
                        message: `OpenWhisk function was hinted ${hostname}${path}`,
                        connectTime: Math.max(timings.dnsLookupAt, timings.tcpConnectionAt, timings.tlsHandshakeAt)
                    });
                }
            });
        });

        req.on('socket', socket => {
            socket.on('lookup', () => {
                timings.dnsLookupAt = new Date().getTime() - now;
            });
            socket.on('connect', () => {
                timings.tcpConnectionAt = new Date().getTime() - now;
            });
            socket.on('secureConnect', () => {
                timings.tlsHandshakeAt = new Date().getTime() - now;
            });
        });

        req.on('error', (err) => {
            console.log(`OpenWhisk function was hinted BUT error: ${err.message}`);
            if (blocking || connectTime) reject(err);
        });

        // write data to request body
        req.write(postData);
        req.end();
    })
};

exports.hintOpenWhisk = hintOpenWhisk;
exports.hintLambda = hintLambda;
exports.postCfcMonitor = postCfcMonitor;