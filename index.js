'use strict';

const Connection = require('./connection');
const Pool = require('./pool');

class Adodb {
    createConnection(connectionString) {
        return new Connection(connectionString);
    }

    createPool(connectionString) {
        return new Pool(connectionString);
    }
}

module.exports = new Adodb();
