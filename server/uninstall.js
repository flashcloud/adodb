'use strict';
const path = require('path');

const Service = require('node-windows').Service;

const svc = new Service({
    name: 'adodb-server',
    script: path.join(__dirname, './server.js')
});

svc.on('uninstall', () => {
    console.log('Uninstall complete.');
    console.log('The service exists: ', svc.exists);
});

svc.uninstall();

