'use strict';

const Sntp = require('sntp');
let offset = null;
let endTime = null;

const setEndTime = (functionExecutionId) => {
    if (offset === null) {
        endTime = null;
        return null
    } else {
        endTime = {
            functionExecutionId: functionExecutionId,
            endTime: new Date().getTime() + offset
        };
        return endTime
    }
};

const getEndTime = () => {
   return endTime
};

const resetEndTime = () => {
    endTime = null;
};

const synchronizeTime = () => {
    return new Promise((resolve, reject) => {
        Sntp.offset((err, offsetResult) => {
            if (err) {
                console.error(err)
                reject(err)
            } else {
                console.log(offsetResult)
                offset = offsetResult;
                resolve(offset)
            }
        });
    })
};

/**
 * Returns a promise which resolves a
 * timestamp recorded at the beginning of the method invocation and corrected by the NTP offset
 * @returns {Promise<any>}
 */
const getTime = () => {
    let currentSystemTime = new Date().getTime();
    return new Promise((resolve, reject) => {
        console.log("time1", currentSystemTime)
        if (offset === null) {
            synchronizeTime().then(offset => {
                resolve(offset + currentSystemTime)
            }).catch(reason => reject(reason))
        } else {
            resolve(offset + currentSystemTime)
        }
    })
};

module.exports.getTime = getTime;
module.exports.setEndTime = setEndTime;
module.exports.getEndTime = getEndTime;
module.exports.resetEndTime = resetEndTime;