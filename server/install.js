'use strict';
const path = require('path');

const nodeWindows = require('node-windows');
const Service = nodeWindows.Service;
const EventLogger = nodeWindows.EventLogger;
const log = new EventLogger('adodb-server install script');

const env = [
    {
        name: 'NODE_ENV',
        value: 'production'
    },
    {
        name: 'ADODB_PATH',
        value: process.cwd()
    }
];

const svc = new Service({
    name: 'adodb-server',
    description: 'The Node.js adodb service',
    script: path.join(__dirname, './server.js'),
    env: env
});

log.info(env[1].name + '=' + env[1].value);
console.log(env[1].name + '=' + env[1].value);
console.log('directory: %s', svc.directory());

svc.on('install', () => {
    console.log('service installed.');
    svc.start();
});

svc.on('alreadyinstalled', () => {
    console.log('This service is already installed.');
});

svc.on('start', () => {
    console.log(svc.name + ' started!');
});

svc.install();
