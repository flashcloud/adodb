'use strict';
const debug = require('debug')('adodb:pool');

const EventEmitter = require('events');
const cpuCount = require('os').cpus().length;
debug('cpuCount: %s', cpuCount);

const Connection = require('../connection');

class Pool extends EventEmitter {
    constructor(connectionString, opts) {
        super();

        this._connectionString = connectionString;
        this._o = opts || {};

        this._o.ttl = this._o.ttl || 15000; // milliseconds, connection time to live after release;
        this._o.maxConnectionsCount = this._o.maxConnectionsCount || 16; //cpuCount;

        //milliseconds, workaround for https://support.microsoft.com/en-us/kb/274211
        //FIXME 不确定是否可以去掉
        //this._o.minConnectionCreationInterval = this._o.minConnectionCreationInterval || 10;

        this._idConn = 0;
        this._connCount = 0;

        this._connQueue = [];
        this._maxConnCount = this._o.maxConnectionsCount;

        this._idlePool = {};
        this._fEnding = false;
    }

    _getConnection() {
        return new Promise((resolve, reject) => {
            let connection = null;

            let connectionId = null;
            for (let k in this._idlePool)
                if (this._idlePool.hasOwnProperty(k)) {
                    connectionId = k;
                    break;
                }

            if (connectionId) {
                let connectionInfoObj = this._idlePool[connectionId];

                clearTimeout(connectionInfoObj.suicideId);
                debug('connection reused idle');
                connection = connectionInfoObj.connection;

                delete this._idlePool[connectionId];

                return resolve(connection);
            } else {
                const connCallback = (err, conn) => {
                    if (err) reject(err);
                    else resolve(conn);
                };

                this._connQueue.unshift({ connCallback });

                if (this._connCount < this._maxConnCount) {
                    debug('connection creation');

                    this._connCount++;
                    connection = new Connection(this._connectionString);
                    connection.on('error', err => {
                        console.error('connection error:', err);
                    });
                    connection.connect()
                        .then(conn => {
                            this._pushConnectionIntoIdlePool(conn);
                        })
                        .catch(err => connCallback(err));
                }
            }
        });
    }

    _getIdConn() {
        return ++this._idConn;
    }

    _getNewConnectionInfoObj(connection) {
        const id = this._getIdConn();
        return { id, connection };
    }

    _pushConnectionIntoIdlePool(connection) {
        debug('_pushConnectionIntoIdlePool');

        if (connection.destroyed) {
            debug('connection is destroyed now, may be because of sql syntax error');
            this._connCount--;
        } else if (this._connQueue.length > 0) {
            let connCallback = this._connQueue.pop().connCallback;
            return connCallback(null, connection);
        } else if (this._fEnding) {
            connection.end();
            this._connCount--;
        } else {
            let connectionInfoObj = this._getNewConnectionInfoObj(connection);
            this._idlePool[connectionInfoObj.id] = connectionInfoObj;
            connectionInfoObj.suicideId = setTimeout(() => {
                debug('suicide connection id: %s', connectionInfoObj.id);

                if (!connection.destroyed) {
                    //TODO 在 sql 语法错误时立即从池中删除对应的 connection
                    // connection is not destroyed already because of sql syntax error
                    console.assert(connection.isIdle());
                    console.assert(this._idlePool[connectionInfoObj.id]);

                    connection.end();
                }
                this._connCount--;

                delete this._idlePool[connectionInfoObj.id];
            }, this._o.ttl);
        }
    }

    async query(sql, values) {
        debug('query, sql: %s', sql);
        debug('query, values: %j', values);

        const connection = await this._getConnection();

        try {
            const result = await connection.query(sql, values);

            if (connection.destroyed) {
                debug('destroyed');
                // delete from pool
                let id = Object.keys(this._idlePool).find(elem => {
                    return this._idlePool[elem].connection === connection;
                });
                if (id) delete this._idlePool[id];
            } else {
                this._pushConnectionIntoIdlePool(connection);
            }

            return result;
        } catch (err) {
            debug(err.message);

            if (connection.destroyed) {
                debug('destroyed');
                let id = Object.keys(this._idlePool).find(elem => {
                    return this._idlePool[elem].connection === connection;
                });
                if (id) delete this._idlePool[id];
            } else {
                this._pushConnectionIntoIdlePool(connection);
            }

            throw err;
        }
    }

    end() {
        debug('end');

        this._fEnding = true;

        Object.keys(this._idlePool).forEach(connectionId => {
            debug('end connectionId: %s', connectionId);
            let connectionInfoObj = this._idlePool[connectionId];
            clearTimeout(connectionInfoObj.suicideId);

            connectionInfoObj.connection.end();
            this._connCount--;

            delete this._idlePool[connectionId];
        });
    }

    destroy() {
        debug('destroy');

        Object.keys(this._idlePool).forEach(connectionId => {
            let connectionInfoObj = this._idlePool[connectionId];
            clearTimeout(connectionInfoObj.suicideId);
            connectionInfoObj.connection.destroy();

            delete this._idlePool[connectionId];
        });
    }
}

module.exports = Pool;

//TODO 正确的错误处理。
// 目前如果执行查询时出错，pool.end() 会留下未完成的进程

//FIXME pool.end() 时终止所有 connection
