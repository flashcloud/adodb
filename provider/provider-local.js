'use strict';

const debug = require('debug')('adodb:provider-local');

const iconv = require('iconv-lite');
const util = require('util');
const getCore = require('../core');

const Duplex = require('stream').Duplex;

util.inherits(Provider, Duplex);

function Provider(options) {
    if (!(this instanceof Provider)) {
        throw new Error("Can't Provide w/o new");
    }
    Duplex.call(this, options);

    const self = this;

    let connString = options.connString;
    let endString = options.endString;
    let errorString = options.errorString;
    let codepageOEM = options.codepageOEM;
    let codepageANSI = options.codepageANSI;

    console.assert(!!connString && !!endString && !!errorString);

    self.codepageOEM = codepageOEM || 866;
    self.codepageANSI = codepageANSI || 1251;

    self._connString = connString;
    self._endString = endString;
    self._errorString = errorString;

    self._endStdOut = false;
    self._endStdErr = false;

    getCore(self._connString, self._endString, (err, core) => {
        if (err) return console.error(err.message);

        self._core = core;
        
        debug('Setting up core event listeners');
        debug('core.stdout readable: %s', core.stdout.readable);
        debug('core.stdout listeners: %j', core.stdout.eventNames());

        core
            .on('error', err => {
                debug('core error: %s', err.message);
                self.emit('error', err);
            })
            .on('close', (code, signal) => {
                debug('core close, code: %s, signal: %s', code, signal);
                self.emit('close', code, signal);
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
                    const decoded = iconv.decode(chunk, self.codepageANSI);
                    const buf = Buffer.from(decoded, 'utf8');
                    debug('readable: read %d bytes', buf.length);
                    
                    if (!self.push(buf)) {
                        debug('readable: backpressure detected, pausing');
                        break;  // Stop reading if push returns false (backpressure)
                    }
                }
            })
            .on('end', () => {
                debug('stdout end');
                self._endStdOut = true;
                if (self._endStdErr) {
                    self.push(null);
                }
            })
            .on('error', err => {
                console.error('Provider._engine.stdout error', err);
            });

        self._stderrBuf = [];
        core.stderr
            .on('data', buf => {
                debug('stderr: %s', buf.toString().trim());
                self._stderrBuf.push(buf);
            })
            .on('end', () => {
                let data = iconv.decode(Buffer.concat(self._stderrBuf), self.codepageOEM);

                debug('stderr end: %s', data.trim());
                if (data.trim().length > 0) {
                    self.push(Buffer.from(errorString + '\n', 'utf8'));
                    self.push(Buffer.from(data.trim() + '\n', 'utf8'));
                    self.push(Buffer.from(endString + '\n', 'utf8'));
                }
                self._endStdErr = true;
                if (self._endStdOut) {
                    self.push(null);
                }
            })
            .on('error', err => {
                console.error('Provider._engine.stderr error', err);
            });

        core.stdin.on('error', err => {
            console.error('Provider._engine.stdin error', err);
        });

        setImmediate(() => {
            debug('ready');
            self.emit('ready');
        });
    });
}

Provider.prototype._read = function() {
    const self = this;

    self._core.stdout.resume();
    self._core.stderr.resume();
};

Provider.prototype._write = function(chunk, encoding, done) {
    const self = this;
    debug('write: %s', chunk.toString().trim());

    const encoded = iconv.encode(chunk, self.codepageANSI);
    
    // Node.js 13.x 关键修复：必须等待 write 回调或 drain 事件
    const canContinue = self._core.stdin.write(encoded, (err) => {
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
        self._core.stdin.once('drain', () => {
            debug('stdin drained');
            done();
        });
    }
};

Provider.prototype.kill = function() {
    const self = this;
    debug('kill');
    self._core.kill();
};

Provider.prototype.killed = function() {
    const self = this;
    debug('kill');
    return self._core.killed();
};

module.exports = Provider;
