'use strict';

// 1) 创建 core 实例不超过 minCoreCreationInterval 的频率
// 2) 执行 spawn

const debug = require('debug')('adodb:core:factory');
const Core = require('./core');
const config = require('../config');

const queue = [];
let lock = false;

//milliseconds, workaround for https://support.microsoft.com/en-us/kb/274211
// 2018-03-20: the url is invalid now, so google for kb274211
let minCoreCreationInterval = config.minCoreCreationInterval;

async function getCore(connString, endString) {
    if (lock) {
        debug('waiting');
        return new Promise((resolve, reject) => {
            queue.unshift({
                connString: connString,
                endString: endString,
                resolve: resolve,
                reject: reject
            });
        });
    }

    const core = new Core(connString, endString);
    await core.spawn();

    lock = true;
    setTimeout(() => {
        debug('end wait');
        lock = false;
        if (queue.length > 0) {
            let coreQueryObj = queue.pop();
            getCore(coreQueryObj.connString, coreQueryObj.endString)
                .then(core => coreQueryObj.resolve(core))
                .catch(err => coreQueryObj.reject(err));
        }
    }, minCoreCreationInterval);

    return core;
}

module.exports = getCore;
