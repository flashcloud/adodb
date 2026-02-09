'use strict';

const program = require('commander');
const version = require('../package').version;

program.version(version);

program
    .command('run')
    .description('run adodb server')
    .action(() => {
        require('./server');
    });

program
    .command('install')
    .description('install adodb as service')
    .action(() => {
        require('./install');
    });

program
    .command('uninstall')
    .description('uninstall adodb service')
    .action(() => {
        require('./uninstall');
    });

program
    .command('start')
    .description('start adodb service')
    .action(() => {
        require('./start');
    });

program
    .command('stop')
    .description('stop adodb service')
    .action(() => {
        require('./stop');
    });

program
    .command('restart')
    .description('restart adodb service')
    .action(() => {
        require('./restart');
    });

program.parse(process.argv);

if (program.args.length < 1) {
    program.help();
}
