'use strict';

const path = require('path');
const mdbPath = path.resolve(__dirname + '/test/media/Northwind2003.mdb').replace('/', '\\');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;

const ADODB = require('./index');

const pool = ADODB.createPool(connStr);

(async () => {
    try {
        const { records } = await pool.query('SELECT * FROM Categories;');
        console.log(records);
    } catch (err) {
        console.error(err.message);
    } finally {
        pool.end();
    }
})();
