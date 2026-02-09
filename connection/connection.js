'use strict';
let debug = require('debug')('adodb:connection');

const config = require('../config');

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const getProvider = require('../provider');

const parseField = require('./speedup/parseField');
const parseDateFn = require('./speedup/parseDateFn');

const utils = require('./utils');
const queryFormat = utils.queryFormat;
const addCharEndingSuffix = utils.addCharEndingSuffix;
const stripComments = require('sql-strip-comments');

const EventEmitter = require('events').EventEmitter;

let states = ['ERROR', 'STARTING', 'READY', 'FIELDS', 'RECORDS', 'LOCALS'].reduce((prev, cur) => {
    prev[cur] = cur;
    return prev;
}, {});

class Record {}

class Connection extends EventEmitter {
    constructor(connectionString) {
        if (!(new.target)) {
            throw new Error("Connection w/o new");
        }
        super();

        this._connStr = connectionString;

        this._fConnected = false;
        this._endString = config.endString;
        this._errorString = config.errorString;

        this._locals = null;

        this._state = states.STARTING;
        this._lines_arr = [];

        this._fields = null;
        this._recordsStr = null;

        this._queryLock = false;
        this._queryQueue = [];
        this._queryCallback = null;
        this._querySql = null;

        this._fEnding = false;
        this._fConnecting = false;
        this._fReady = false;
    }

    isIdle() {
        return !this._queryLock && this._fConnected;
    }

    _parseRecordsStr() {
        let fields = this._fields;
        let values = this._recordsStr.split('\t');
        values.length = values.length - 1; // last elem always empty

        console.assert(values.length % fields.length === 0);

        let records = [];
        let parseDateTimeFn = parseDateFn(this._locals.sShortDate, this._locals.sTimeFormat);

        let curValueIndex = 0;
        while (curValueIndex < values.length) {
            let record = new Record();
            for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
                record[fields[fieldIndex]['Name']] = parseField(
                    fields[fieldIndex],
                    values[curValueIndex],
                    this._locals.sDecimal,
                    parseDateTimeFn
                );

                curValueIndex++;
            }
            records.push(record);
        }

        this._records = records;
    }

    _setLocals(locals) {
        this._locals = locals;
        debug('set locals: %j', this._locals);

        this._provider.codepageANSI = this._locals.ACP;
        this._provider.codepageOEM = this._locals.OEMCP;
    }

    _setState(state) {
        if (this._state !== state) {
            this._lines_arr.length = 0;
            this._state = state;
            debug('set state: %s', this._state);
        }
    }

    _step(line) {
        if (line === this._errorString) {
            this._setState(states.ERROR);
            return;
        }

        switch (this._state) {
            case states.ERROR:
                if (line === this._endString) {
                    let err = new Error(this._lines_arr.join('\n').trim());
                    if (this._queryCallback) {
                        this._queryCallback(err);
                        this._queryCallback = null;
                    }
                    this.destroy();

                    //FIXME непонятно, можно ли убрать
                    //this.emit('error', err);
                    return;
                }
                break;
            case states.STARTING:
                if (line === 'LOCALS') {
                    this._setState(states.LOCALS);
                    return;
                }
                break;
            case states.LOCALS:
                if (line === this._endString) {
                    this._setLocals(JSON.parse(this._lines_arr.join('\n')));

                    this._fReady = true;
                    if (this._queryQueue.length > 0) {
                        this._execSQLfromQueue();
                        debug('LOCALS this._queryQueue.length: %d', this._queryQueue.length);
                    }

                    this._setState(states.READY);
                    return;
                }
                break;
            case states.READY:
                if (line === states.FIELDS) {
                    this._setState(states.FIELDS);
                    return;
                } else if (line === states.RECORDS) {
                    this._setState(states.RECORDS);
                    return;
                }
                break;
            case states.FIELDS:
                if (line === this._endString) {
                    this._fields = JSON.parse(this._lines_arr.join('\n'));

                    debug(states.FIELDS + ': %j', this._fields);
                    this._setState(states.RECORDS);
                    return;
                }
                break;
            case states.RECORDS:
                if (line === this._endString) {
                    this._recordsStr = this._lines_arr.join('\n');
                    debug(states.RECORDS + ': %s', JSON.stringify(this._recordsStr.split('\t')).slice(0, 1000));

                    this._parseRecordsStr();
                    // console.log(states.RECORDS + ': parsed: ', this._records);
                    if (this._queryCallback) {
                        this._queryCallback(null, this._records, this._fields);
                        this._records = null;
                    }

                    if (this._queryQueue.length > 0) {
                        this._execSQLfromQueue();
                        debug('RECORDS this._queryQueue.length: %d', this._queryQueue.length);
                    } else {
                        this._queryLock = false;

                        if (this._fEnding) {
                            if (this._provider.writable) this._provider.write(addCharEndingSuffix(this._endString));
                            this._fConnected = false;
                        }
                    }
                    this._setState(states.READY);
                    return;
                }
                break;
            default:
        }

        // 如果行未被处理，则累积到数组中
        this._lines_arr.push(line);
    }

    _execSQLfromQueue() {
        debug('execSQLfromQueue this._queryQueue.length: %d', this._queryQueue.length);

        console.assert(this._queryQueue.length > 0);

        let query = this._queryQueue.pop();
        this._querySql = query.sql;
        this._queryCallback = query.callback;

        this._sendSQL(query.sql);
    }

    _sendSQL(sql) {
        debug('send sql: %s', sql);
        this._provider.write(addCharEndingSuffix('SQL'));

        this._provider.write(addCharEndingSuffix(sql));
        this._provider.write(addCharEndingSuffix(this._endString));

        this._queryLock = true;
    }

    _readLine(line) {
        this._step(line);

        debug('line: %s', line.slice(0, 100));
    }

    async query(sql, values) {
        debug('query, sql: %s', sql);

        if (sql.slice(-4).toLowerCase() === '.sql') {
            sql = path.resolve(sql);
            const sqlText = await fs.promises.readFile(sql, 'utf8');
            return this.query(sqlText, values);
        }

        sql = stripComments(sql);
        sql = queryFormat(sql, values);

        debug('SQL: %s', sql);

        if (this._fEnding) {
            throw new Error('Ending connection can not query');
        }

        return new Promise((resolve, reject) => {
            const callback = (err, records, fields) => {
                if (err) reject(err);
                else resolve({ records, fields });
            };

            if (this._fConnected) {
                if (this._queryLock || !this._fReady || this._queryQueue.length > 0) {
                    this._queryQueue.unshift({ sql: sql, callback: callback });
                    debug('query enqueue, sql: %s, this._queryQueue.length: %d', sql, this._queryQueue.length);
                } else {
                    this._querySql = sql;
                    this._queryCallback = callback;

                    this._sendSQL(sql);
                }
            } else {
                this._queryQueue.unshift({ sql: sql, callback: callback });
                debug('query enqueue, sql: %s, this._queryQueue.length: %d', sql, this._queryQueue.length);

                if (!this._fConnecting) {
                    this.connect().catch(err => {
                        debug('ERROR');

                        //FIXME непонятно, можно ли убрать
                        //this.destroy();
                    });
                }
            }
        });
    }

    destroy() {
        debug('destroy');

        this.destroyed = true;

        if (this._fConnected || this._fConnecting) {
            this._provider.kill();
            this._fConnected = false;

            if (this._queryCallback) {
                let err = new Error('Connection was destroyed while executing sql: ' + this._querySql);
                this._queryCallback(err);
            }

            while (this._queryQueue.length > 0) {
                let query = this._queryQueue.pop();
                let err = new Error('Connection was destroyed before execution of sql: ' + query.sql);
                query.callback(err);
            }
        }
    }

    // gracefully close connection
    end() {
        debug('end');

        setImmediate(() => {
            this._fEnding = true;
            if (this._fConnected) {
                if (this._queryQueue.length === 0 && !this._queryLock) {
                    if (this._provider.writable) this._provider.write(addCharEndingSuffix(this._endString));
                }
            }
        });
    }

    async connect() {
        debug('connect');

        this._fConnecting = true;

        const provider = await getProvider({
            connString: this._connStr,
            endString: this._endString,
            errorString: this._errorString
        });

        debug('getProvider');

        this._provider = provider;

        this._provider
            .on('error', err => {
                debug('provider error: %s', err.message);

                //FIXME непонятно, можно ли убрать
                //this.emit('error', err);
            })
            .on('close', (code, signal) => {
                debug('provider close, code: %s, signal: %s', code, signal);
                if (code !== 0 && this._lines_arr.length > 0) {
                    console.log('stdOut:\n', this._lines_arr.join('n'));
                }
                this.emit('close', code);
                this._fConnected = false;
            });

        this._rlStream = readline
            .createInterface({
                input: this._provider,
                crlfDelay: Infinity  // 关键：处理 \r\n 为单个换行
            })
            .on('line', line => {
                this._readLine(line);
            });

        return new Promise(resolve => {
            process.nextTick(() => {
                debug('start');
                this._fConnecting = false;
                this._fConnected = true;

                this.emit('open');
                resolve(this);
            });
        });
    }
}

module.exports = Connection;

//TODO options allowComments, multipleStatements, speedUp ( Recordset.GetString() instead of Recordset.MoveNext() );

//TODO 除了 records，返回 fields;

//TODO 计算查询执行时间;

//TODO 正确处理语法错误。
// 目前如果查询中有语法错误，Core 会停止，而对应的 Connection 不知道这一点
