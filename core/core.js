'use strict';
/**
 * Windows specific code
 */

const debug = require('debug')('adodb:core');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;
const { spawn } = require('child_process');

let script = path.join(__dirname, 'scripts/adodb.js'),
    sysroot = process.env['systemroot'] || process.env['windir'];
let x64 = true;
try {
    fs.accessSync(path.join(sysroot, 'SysWOW64'), fs.F_OK);
} catch (err) {
    if (err.code === 'ENOENT') {
        x64 = false;
    } else {
        throw err;
    }
}
let cscriptPath = path.join(sysroot, x64 ? 'SysWOW64' : 'System32', 'cscript.exe');

class Core extends EventEmitter {
    constructor(connString, endString) {
        if (!(new.target)) {
            throw new Error("Can't Core w/o new");
        }

        console.assert(!!connString && !!endString);

        super();

        this._connString = connString;
        this._endString = endString;
        this._coreProc = null;

        this.stdout = null;
        this.stdin = null;
        this.stderr = null;
    }

    async spawn() {
        debug('spawning %s, %s; connString: %s, endString: %s', cscriptPath, script, this._connString, this._endString);

        this._coreProc = spawn(cscriptPath, ['//E:JScript', '//Nologo', script, this._connString, this._endString], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.stdout = this._coreProc.stdout;
        this.stdin = this._coreProc.stdin;
        this.stderr = this._coreProc.stderr;

        this._coreProc.on('error', err => {
            debug('error: %s', err.message);
            this.emit('error', err);
        });

        this._coreProc.on('close', (code, signal) => {
            debug('close, code: %s, signal: %s', code, signal);
            this.emit('close', code, signal);
        });

        // Critical fix for Node.js 13.x: delay to next tick
        // This ensures provider can set up listeners before any data arrives
        return new Promise(resolve => {
            process.nextTick(() => {
                resolve(this);
            });
        });
    }

    kill() {
        debug('kill');
        try {
            this._coreProc.kill();
        } catch (err) {}
    }

    killed() {
        return this._coreProc.killed;
    }
}

module.exports = Core;

//TODO передачу вместо endStr и errorStr строки для кодирования, чтобы endStr = END + <код> и errorStr = ERROR + <код>
