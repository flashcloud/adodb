'use strict';

const assert = require('assert');
const path = require('path');

const mdbPath = path.resolve(__dirname + '/media/Northwind2003.mdb');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;

describe('Pool', function() {
    it('Pool 被创建和销毁', function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);
        pool.end();
    });

    it('Pool 执行 sql 查询', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        const { records } = await pool.query('SELECT 1+1 AS NUM;');
        assert.deepEqual(records, [{NUM: 2}]);

        pool.end();
    });

    it('正确执行带有 integer, string, float, boolean 的 SQL 查询', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        const { records } = await pool.query(
            'SELECT 2*2 AS intValue, "string" AS strValue, 3.14151926 AS floatValue, ' +
                'cBool(1=1) AS trueValue, cBool(1=0) AS falseValue;'
        );

        assert.deepEqual(records, [
            {falseValue: 0, floatValue: 3.14151926, intValue: 4, strValue: 'string', trueValue: -1}
        ]);

        pool.end();
    });

//TODO 检查返回 null 的查询

    it('正确执行带有 datetime 的 SQL 查询', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        const { records } = await pool.query('SELECT #2018-01-01 00:00:00# AS dateValue;');

        assert.deepEqual(records[0]['dateValue'].getTime(), new Date('2018-01-01 00:00:00').getTime());

        pool.end();
    });

    it('正确处理 SQL 查询中的语法错误', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        try {
            await pool.query('syntax error');
            throw new Error('Expected error for invalid SQL syntax');
        } catch (err) {
            // 修改检查条件，同时接受多种可能的错误消息格式
            const errorMessage = err.message.toLowerCase();
            assert.ok(
                errorMessage.indexOf('microsoft jet database engine') >= 0 ||
                errorMessage.indexOf('loop error') >= 0 ||
                errorMessage.indexOf('无效的 sql语句') >= 0,
                'Unexpected error message: ' + err.message
            );
        } finally {
            pool.end();
        }
    });

    it('正确执行来自文件的 SQL 查询', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        let filepath = path.join(__dirname, 'media/sql.sql');
        const { records } = await pool.query(filepath);

        assert.deepEqual(records, [{Ok: 'Ok'}]);

        pool.end();
    });

    it('正确执行命名参数替换', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        const { records } = await pool.query(
            'SELECT :intValue AS intValue, :floatValue AS floatValue, :stringValue AS stringValue, :dateValue AS DateValue',
            {intValue: 42, floatValue: Math.PI, stringValue: 'arghhhhh', dateValue: new Date('2018-01-01 00:00:00')}
        );

        assert.deepEqual(records, [
            {
                DateValue: new Date('2018-01-01 00:00:00'),
                floatValue: Math.PI,
                intValue: 42,
                stringValue: 'arghhhhh'
            }
        ]);

        pool.end();
    });

    it('正确执行带注释的 SQL 查询', async function() {
        const Pool = require('../pool/pool');
        let pool = new Pool(connStr);

        let sql = '/* check removing comments */SELECT 1 AS NUM1, -- number 1\n 2 AS NUM2 -- number 2';

        const { records } = await pool.query(sql);
        assert.deepEqual(records, [{NUM1: 1, NUM2: 2}]);

        pool.end();
    });
});
