'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const mdbPath = path.resolve(__dirname+'/media/Northwind2003.mdb');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;
const endStr = 'END{ea3afd54-bb63-4d3d-aab3-0e7d4eeb696d}';

describe('Core', function () {
    it('找到数据库文件', function (done) {
        fs.stat(mdbPath, (err, stat) => {
            if (err) return done(err);
            done(null);
        });
    });

    it('通过工厂创建并销毁 Core 实例', function (done) {
        const getCore = require('../core');
        getCore(connStr, endStr, (err, core) => {
            if (err) return done(err);
            core.kill();

            if (core.killed()) {
                done(null)
            } else {
                done(new Error())
            }
        })
    });

    it('Core 实例创建间隔不小于 config.minCoreCreationInterval', function (done) {
        this.timeout(10000);
        const getCore = require('../core');
        let minCoreCreationInterval = require('../config').minCoreCreationInterval;

        let counter = 0;
        let t1, t2;

        function timeDiff() {
            if (counter === 0 ) {
                counter++;
                t1 = process.hrtime();
            } else if (counter === 1) {
                counter++;
                t2 = process.hrtime(t1);
                let ms = t2[0]*1e3 + t2[1]*1e-6;
                //console.log(ms);

                if ((ms < minCoreCreationInterval) || (ms > 2*minCoreCreationInterval)) {
                    done(new Error());
                } else {
                    done(null);
                }
            }
        }

        getCore(connStr, endStr, (err, core) => {
            if (err) return done(err);
            timeDiff();
            core.kill();
        });
        getCore(connStr, endStr, (err, core) => {
            if (err) return done(err);
            timeDiff();
            core.kill();
        })
    });

});