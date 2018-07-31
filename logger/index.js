'use strict';

class Logger {
    constructor() {
        this.logs = [];
    }



    log(message) {
        this.logs.push(message);
        console.log(message);
    }

    err(message) {
        this.logs.push(message);
        console.error(message);
    }
}

module.exports = Logger;