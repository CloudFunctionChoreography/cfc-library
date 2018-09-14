'use strict';

const Sntp = require('sntp');

class Time {
    static offset = null;

    static synchronizeTime() {
        return new Promise((resolve, reject) => {
            Sntp.offset((err, offset) => {
                if (err) {
                    reject(err)
                } else {
                    Time.offset = offset;
                    resolve(offset)
                }
            });
        })
    }

    /**
     * Returns a promise which resolves a
     * timestamp recorded at the beginning of the method invocation and corrected by the NTP offset
     * @returns {Promise<any>}
     */
    static getTime() {
        let currentSystemTime = new Date().getTime();
        return new Promise((resolve, reject) => {
            if (this.offset === null) {
                Time.synchronizeTime().then(offset => {
                    resolve(offset + currentSystemTime)
                }).catch(reason => reject(reason))
            } else {
                resolve(this.offset + currentSystemTime)
            }
        })
    }

}

module.exports = Time;