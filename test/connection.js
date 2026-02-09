'use strict';

const assert = require('assert');
const path = require('path');

const mdbPath = path.resolve(__dirname + '/media/Northwind2003.mdb');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;

describe('Connection', function() {
    it('parseDateFn 正确解析日期', function() {
        const parseDateFn = require('../connection/speedup/parseDateFn');

        let d1, d2;

        d1 = parseDateFn('yyyy-MM-dd', 'H:m:s')('2018-01-05 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('dd-MM-yyyy', 'H:m:s')('05-01-2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('dd/MM/yyyy', 'H:m:s')('05/01/2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('dd.MM.yyyy', 'H:m:s')('05.01.2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('MM.dd.yyyy', 'H:m:s')('01.05.2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('MM-dd-yyyy', 'H:m:s')('01-05-2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('MM/dd/yyyy', 'H:m:s')('01/05/2018 12:34:56').toString();
        d2 = new Date('2018-01-05 12:34:56').toString();
        assert.equal(d1, d2);

        d1 = parseDateFn('MM\\dd\\yyyy', 'H:m:s')('01\\05\\2018 12:34:56').toString();
        d2 = '01\\05\\2018 12:34:56'; // can`t parse this format
        assert.equal(d1, d2);
    });

    it('Connection 被创建和销毁', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        const conn = await connection.connect();
        conn.end();
    });

    it('正确执行带有 integer, string, float, boolean 的 SQL 查询', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        const { records } = await connection.query(
            'SELECT 2*2 AS intValue, "string" AS strValue, 3.14151926 AS floatValue, ' +
                '1=1 AS trueValue, 1=0 AS falseValue;'
        );

        assert.deepEqual(records, [
            {floatValue: 3.14151926, intValue: 4, strValue: 'string', trueValue: -1, falseValue: 0}
        ]);

        connection.end();
    });

    it('正确执行带有 boolean 的 SQL 查询', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        const { records, fields } = await connection.query(
            'SELECT ProductID, Discontinued FROM Products WHERE ProductID IN (1, 5);'
        );

        assert.deepEqual(fields, [
            {Name: 'ProductID', Type: 3, Precision: 10, NumericScale: 255},
            {
                Name: 'Discontinued',
                Type: 11,
                Precision: 255,
                NumericScale: 255
            }
        ]);
        assert.deepEqual(records, [{ProductID: 1, Discontinued: false}, {ProductID: 5, Discontinued: true}]);

        connection.end();
    });

    it('正确执行带有 datetime 的 SQL 查询', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        const { records } = await connection.query('SELECT #2018-01-01 00:00:00# AS dateValue;');

        assert.deepEqual(records[0]['dateValue'].getTime(), new Date('2018-01-01 00:00:00').getTime());

        connection.end();
    });

    it('正确执行带有 null 的 SQL 查询', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        // 如果查询返回逻辑表达式的值，则字段类型将是 adSmallInt (2)，而不是 adBoolean (11)。
        // 但是如果查询返回逻辑字段的值，则字段类型将是 adBoolean (11)
        //
        // 对于数值字段，如果值为 NULL，则返回值 0。
        // 对于文本字段，如果值为 NULL，则返回空字符串
        //
        // 字段类型: https://msdn.microsoft.com/ru-ru/library/ms675318(v=vs.85).aspx

        const { records } = await connection.query(
            'SELECT cr.CustomerID, cr.EmployeeID, ord.OrderID AS NumericNull, ord.OrderDate AS DateNull, ord.ShipName AS StringNull, IIF(ord.OrderID IS NULL, FALSE, TRUE) AS booleanValue FROM Orders ord RIGHT JOIN (SELECT CustomerID, EmployeeID FROM Customers, Employees) cr  ON (ord.CustomerID = cr.Customers.CustomerID AND ord.EmployeeID = cr.EmployeeID) WHERE cr.CustomerID="ALFKI" AND cr.EmployeeID IN (1, 2) ORDER BY cr.CustomerID, cr.EmployeeID;'
        );

        assert.deepEqual(records, [
            {
                CustomerID: 'ALFKI',
                EmployeeID: 1,
                NumericNull: 10952,
                DateNull: new Date('1998-03-16 00:00:00'),
                StringNull: 'Alfreds Futterkiste',
                booleanValue: -1
            },
            {
                CustomerID: 'ALFKI',
                EmployeeID: 1,
                NumericNull: 10835,
                DateNull: new Date('1998-01-15 00:00:00'),
                StringNull: 'Alfreds Futterkiste',
                booleanValue: -1
            },
            {
                CustomerID: 'ALFKI',
                EmployeeID: 2,
                NumericNull: 0,
                DateNull: null,
                StringNull: '',
                booleanValue: 0
            }
        ]);

        connection.end();
    });

    it('正确处理 SQL 查询中的语法错误', async function() {
        const Connection = require('../connection/connection');

        let connection = new Connection(connStr);

        try {
            await connection.query('syntax error');
            throw new Error('Expected error for invalid SQL syntax');
        } catch (err) {
            // 修改检查条件，同时接受两种可能的错误消息格式
            const errorMessage = err.message.toLowerCase();
            assert.ok(
                errorMessage.indexOf('microsoft jet database engine') >= 0 ||
                errorMessage.indexOf('loop error') >= 0 ||
                errorMessage.indexOf('无效的 sql语句') >= 0,
                'Unexpected error message: ' + err.message
            );
        } finally {
            connection.end();
        }
    });

    it('正确执行来自文件的 SQL 查询', async function() {
        const Connection = require('../connection/connection');
        let connection = new Connection(connStr);

        let filepath = path.join(__dirname, 'media/sql.sql');
        const { records } = await connection.query(filepath);

        assert.deepEqual(records, [{Ok: 'Ok'}]);

        connection.end();
    });

    it('正确执行命名参数替换', async function() {
        const Connection = require('../connection/connection');
        let connection = new Connection(connStr);

        const { records } = await connection.query(
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

        connection.end();
    });
});
