'use strict';

const debug = require('debug')('adodb:provider-local');

const iconv = require('iconv-lite');
const getCore = require('../core');

const { Duplex } = require('stream');

class ProviderLocal extends Duplex {
    constructor(options) {
        if (!(new.target)) {
            throw new Error("Can't Provide w/o new");
        }
        super(options);

        const connString = options.connString;
        const endString = options.endString;
        const errorString = options.errorString;
        const codepageOEM = options.codepageOEM;
        const codepageANSI = options.codepageANSI;

        console.assert(!!connString && !!endString && !!errorString);

        this.codepageOEM = codepageOEM || 866;
        this.codepageANSI = codepageANSI || 1251;

        this._connString = connString;
        this._endString = endString;
        this._errorString = errorString;

        this._endStdOut = false;
        this._endStdErr = false;

        this._core = null;
        this._stderrBuf = [];
    }

    async init() {
        const core = await getCore(this._connString, this._endString);
        this._core = core;

        debug('Setting up core event listeners');
        debug('core.stdout readable: %s', core.stdout.readable);
        debug('core.stdout listeners: %j', core.stdout.eventNames());

        core
            .on('error', err => {
                debug('core error: %s', err.message);
                this.emit('error', err);
            })
            .on('close', (code, signal) => {
                debug('core close, code: %s, signal: %s', code, signal);
                this.emit('close', code, signal);
            });

        debug('Adding stdout readable listener (Node.js 13.x compatibility)');
        // Critical fix for Node.js 13.x: use 'readable' event instead of 'data'
        // In Node.js 13.x, streams default to paused mode and only emit 'readable'
        core.stdout
            .on('readable', () => {
                debug('stdout readable event');
                let chunk;
                // Read all available data
                while (null !== (chunk = core.stdout.read())) {
                    const decoded = iconv.decode(chunk, this.codepageANSI);
                    const buf = Buffer.from(decoded, 'utf8');
                    debug('readable: read %d bytes', buf.length);

                    if (!this.push(buf)) {
                        debug('readable: backpressure detected, pausing');
                        break;  // Stop reading if push returns false (backpressure)
                    }
                }
            })
            .on('end', () => {
                debug('stdout end');
                this._endStdOut = true;
                if (this._endStdErr) {
                    this.push(null);
                }
            })
            .on('error', err => {
                console.error('Provider._engine.stdout error', err);
            });

        this._stderrBuf = [];
        core.stderr
            .on('data', buf => {
                debug('stderr: %s', buf.toString().trim());
                this._stderrBuf.push(buf);
            })
            .on('end', () => {
                let data = iconv.decode(Buffer.concat(this._stderrBuf), this.codepageOEM);

                debug('stderr end: %s', data.trim());
                if (data.trim().length > 0) {
                    this.push(Buffer.from(this._errorString + '\n', 'utf8'));
                    this.push(Buffer.from(data.trim() + '\n', 'utf8'));
                    this.push(Buffer.from(this._endString + '\n', 'utf8'));
                }
                this._endStdErr = true;
                if (this._endStdOut) {
                    this.push(null);
                }
            })
            .on('error', err => {
                console.error('Provider._engine.stderr error', err);
            });

        core.stdin.on('error', err => {
            console.error('Provider._engine.stdin error', err);
        });

        return new Promise(resolve => {
            setImmediate(() => {
                debug('ready');
                resolve();
            });
        });
    }

    _read() {
        this._core.stdout.resume();
        this._core.stderr.resume();
    }

    _write(chunk, encoding, done) {
        debug('write: %s', chunk.toString().trim());

        const encoded = iconv.encode(chunk, this.codepageANSI);

        // Node.js 13.x 关键修复：必须等待 write 回调或 drain 事件
        const canContinue = this._core.stdin.write(encoded, (err) => {
            if (err) {
                debug('stdin write error: %s', err.message);
            }
        });

        if (canContinue) {
            // 缓冲区未满，使用 setImmediate 确保数据已进入内核
            setImmediate(done);
        } else {
            // 缓冲区满，等待 drain 事件
            debug('stdin buffer full, waiting for drain');
            this._core.stdin.once('drain', () => {
                debug('stdin drained');
                done();
            });
        }
    }

    kill() {
        debug('kill');
        this._core.kill();
    }

    killed() {
        debug('killed');
        return this._core.killed();
    }
}

module.exports = ProviderLocal;
