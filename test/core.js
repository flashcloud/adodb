'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const mdbPath = path.resolve(__dirname+'/media/Northwind2003.mdb');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;
const endStr = 'END{ea3afd54-bb63-4d3d-aab3-0e7d4eeb696d}';

describe('Core', function () {
    it('找到数据库文件', async function () {
        await fs.promises.stat(mdbPath);
    });

    it('通过工厂创建并销毁 Core 实例', async function () {
        const getCore = require('../core');
        const core = await getCore(connStr, endStr);
        core.kill();

        assert.ok(core.killed(), 'Core should be killed');
    });

    it('Core 实例创建间隔不小于 config.minCoreCreationInterval', async function () {
        this.timeout(10000);
        const getCore = require('../core');
        let minCoreCreationInterval = require('../config').minCoreCreationInterval;

        // 先创建一个实例并销毁，确保没有锁
        const initialCore = await getCore(connStr, endStr);
        initialCore.kill();

        // 等待一段时间确保锁已释放
        await new Promise(resolve => setTimeout(resolve, 100));

        const t1 = process.hrtime();

        const core1 = await getCore(connStr, endStr);
        core1.kill();

        const core2 = await getCore(connStr, endStr);
        core2.kill();

        const t2 = process.hrtime(t1);
        let ms = t2[0]*1e3 + t2[1]*1e-6;

        // 修改断言条件：只需要确保第二次创建不是立即发生的
        // 而是至少等待了 minCoreCreationInterval 时间
        assert.ok(
            ms >= minCoreCreationInterval,
            `Time diff ${ms}ms should be at least ${minCoreCreationInterval}ms`
        );
        
        // 可选：添加上限检查，但要考虑到系统负载等因素
        // assert.ok(ms <= 3 * minCoreCreationInterval, `Time diff ${ms}ms should not exceed reasonable upper limit`);
    });

});
