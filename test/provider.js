'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const mdbPath = path.resolve(__dirname+'/media/Northwind2003.mdb');
const connStr = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + mdbPath;
const endStr = 'END{ea3afd54-bb63-4d3d-aab3-0e7d4eeb696d}';
const errorStr = 'ERROR{ea3afd54-bb63-4d3d-aab3-0e7d4eeb696d}';

describe('Provider', function () {
    it('parse-conn-str 正确解析连接字符串', function () {
        const parseConnStr = require('../provider/parse-conn-str');
        let cStr = connStr;

        assert.deepEqual(parseConnStr(cStr), {remote: false, connStr: cStr});

        cStr = 'provider=adodb-server;    Host = localhost;  Port=   4023';
        assert.deepEqual(parseConnStr(cStr), {remote: true, host:'localhost', port:4023});
    });

    it('通过工厂创建并销毁 Provider-local 实例', async function () {
        const getProvider = require('../provider');

        let options = {
            connString: connStr,
            endString: endStr,
            errorString: errorStr
        };

        const provider = await getProvider(options);
        provider.kill();

        assert.ok(provider.killed(), 'Provider should be killed');
    });

    it('Provider-local 实例在创建时向流中写入正确的 connStr 和 endStr', async function () {
        const getProvider = require('../provider');
        const readline = require('readline');

        let options = {
            connString: connStr,
            endString: endStr,
            errorString: errorStr
        };

        const provider = await getProvider(options);

        return new Promise((resolve, reject) => {
            const rl = readline.createInterface({
                input: provider
            });

            let provConnStr = null, provEndStr = null;

            function parseProviderOut(line) {
                if (line.slice(0, 9) === 'connStr: ') {
                    provConnStr = line.slice('connStr: '.length).trim();
                } else if (line.slice(0, 8) === 'endStr: ') {
                    provEndStr = line.slice('endStr: '.length).trim();
                }

                return (!!provConnStr && !!provEndStr);
            }

            function close() {
                provider.kill();
                if (provider.killed() && (provConnStr === connStr) && (provEndStr === endStr)) {
                    resolve();
                } else {
                    reject(new Error('Provider output mismatch'));
                }
            }

            rl.on('line', (line) => {
                if (parseProviderOut(line)) close();
            });
        });
    });

});
