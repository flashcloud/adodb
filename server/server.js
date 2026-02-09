'use strict';

const debug = require('debug')('adodb:server');
const config = require('../config');

const configServer = require('./config-server');

const net = require('net');

const getProvider = require('../provider');

const fs = require('fs');
const path = require('path');
const intercept = require('intercept-stdout');

let adodbPath = process.env['ADODB_PATH'];
console.log('ADODB_PATH: ' + adodbPath);

if (!adodbPath) adodbPath = process.cwd();

const configFile = path.join(adodbPath, 'adodb-config.json');

const stdLog = fs.createWriteStream(path.join(adodbPath, 'stdout.log'));
const errLog = fs.createWriteStream(path.join(adodbPath, 'stderr.log'));

const unhook_intercept = intercept(
    function(txt) {
        stdLog.write(txt);
    },
    function(txt) {
        errLog.write(txt);
    }
);

console.log('config file:', configFile);

(async () => {
    let options;

    try {
        const data = await fs.promises.readFile(configFile);
        options = JSON.parse(data);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }

        debug(err.message);

        const templateData = await fs.promises.readFile(path.join(__dirname, '../adodb-config.template.json'));
        options = JSON.parse(templateData);

        if (!options.connString) {
            options.connString =
                'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' +
                path.resolve(path.join(__dirname, '../test/media/Northwind2003.mdb')).replace('/', '\\');
            debug(options.connString);
        }

        await fs.promises.writeFile(configFile, JSON.stringify(options, null, 2));
    }

    startServer(options);
})();

function startServer(options) {
    debug('options: %j', options);

    let socketCount = 0;

    let server = net
        .createServer(socket => {
            debug('create server');

            socketCount++;

            let socketProvider = null;

            getProvider({
                connString: options.connString,
                endString: config.endString,
                errorString: config.errorString
            })
                .then(provider => {
                    if (socket.destroyed) {
                        // 防止创建 provider 被放入队列后，连接断开的情况
                        console.log('socket.destroyed', socket.destroyed);
                        provider.kill();
                        return;
                    }
                    console.log(
                        'New connection, address:',
                        socket.remoteAddress + ', port:' + socket.remotePort,
                        ', family: ',
                        socket.remoteFamily,
                        ', socketCount:',
                        socketCount
                    );

                    provider.pipe(socket);
                    socket.pipe(provider);

                    socketProvider = provider;
                })
                .catch(err => {
                    socket.write(err.message);
                });

            socket.on('data', data => {
                debug('RECIEVED: %s', data.toString());
            });

            socket.on('error', err => {
                console.error('server socket error:', err.message);
                //console.error(err.stack)
            });

            socket.on('close', had_error => {
                socketCount--;
                console.log('Connection closed, had_error:', had_error, ', open sockets:', socketCount);
                if (had_error) {
                    //console.log('socketProvider:', socketProvider);
                    if (!!socketProvider) {
                        console.log('killing socketProvider');
                        socketProvider.kill();
                    }
                }
            });
        })
        .on('error', err => {
            throw err;
        })
        .on('connection', socket => {
            debug('on connection, socket: %j', socket);
        });

    server.listen(options.port, () => {
        let address = server.address();
        console.log('opened server on %j', address);
    });
}

// TODO 参考这里安装服务: https://github.com/AndyGrom/node-deploy-server
