'use strict';

const debug = require('debug')('adodb:provider-remote');
const config = require('../config');
const net = require('net');

const iconv = require('iconv-lite');

const { Duplex } = require('stream');

class ProviderRemote extends Duplex {
    constructor(options) {
        debug('new ProviderRemote');
        if (!(new.target)) {
            throw new Error("Can't Provide w/o new");
        }
        super(options);

        this._host = options.host;
        this._port = options.port;

        const endString = options.endString;
        const errorString = options.errorString;
        const codepageOEM = options.codepageOEM;
        const codepageANSI = options.codepageANSI;

        console.assert(!!this._host && !!this._port && !!endString && !!errorString);

        this.codepageOEM = codepageOEM || 866;
        this.codepageANSI = codepageANSI || 1251;

        this._endString = endString;
        this._errorString = errorString;

        this._endStdOut = false;
        this._endStdErr = false;

        this._socket = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this._socket = net.createConnection({ host: this._host, port: this._port }, () => {
                debug('connected to server');

                let options = JSON.stringify({
                    endString: config.endString,
                    errorString: config.errorString
                });

                setImmediate(() => {
                    debug('ready');
                    resolve();
                });
            });

            this._socket
                .on('error', err => {
                    debug('socket error: %s', err.message);
                    this.push(Buffer.from(this._errorString + '\n', 'utf8'));
                    this.push(Buffer.from(err.message + '\n', 'utf8'));
                    this.push(Buffer.from(this._endString + '\n', 'utf8'));
                    this.emit('error', err);
                })
                .on('close', (code, signal) => {
                    debug('socket close, code: %s, signal: %s', code, signal);
                    this.emit('close', code, signal);
                })
                .on('readable', () => {
                    debug('socket readable event');
                    let chunk;
                    // Read all available data
                    while (null !== (chunk = this._socket.read())) {
                        const decoded = iconv.decode(chunk, this.codepageANSI);
                        const buf = Buffer.from(decoded, 'utf8');
                        debug('readable: read %d bytes', buf.length);

                        if (!this.push(buf)) {
                            debug('readable: backpressure detected, pausing');
                            //break;  // Stop reading if push returns false (backpressure)
                            this._socket.pause();
                        }
                    }
                })
                .on('end', () => {
                    this.push(null);
                });

            this.on('error', err => {
                debug('ProviderRemote error:', err.message);
                //console.error(err.stack);
                this.push(Buffer.from(this._errorString + '\n', 'utf8'));
                this.push(Buffer.from(err.message + '\n', 'utf8'));
                this.push(Buffer.from(this._endString + '\n', 'utf8'));
            });
        });
    }

    _read(size) {
        //debug('_read');
        this._socket.resume();
    }

    _write(chunk, encoding, done) {
        debug('_write: %s', chunk.toString().trim());

        const encoded = iconv.encode(chunk, this.codepageANSI);

        // Node.js 13.x 关键修复：必须等待 write 回调或 drain 事件
        const canContinue = this._socket.write(encoded, (err) => {
            if (err) {
                debug('socket write error: %s', err.message);
            }
        });

        if (canContinue) {
            // 缓冲区未满，使用 setImmediate 确保数据已进入内核
            setImmediate(done);
        } else {
            // 缓冲区满，等待 drain 事件
            debug('socket buffer full, waiting for drain');
            this._socket.once('drain', () => {
                debug('socket drained');
                done();
            });
        }        

        // if (!this._socket.write(chunk)) {
        //     this.cork();
        //     this.once('drain', () => {
        //         this.uncork();
        //     });
        // }

        // done();
    }

    kill() {
        debug('kill');
        this._socket.end();
        this._socket.destroy();
        this._socket.unref();
    }
}

module.exports = ProviderRemote;

//TODO 所有错误通过流传递
