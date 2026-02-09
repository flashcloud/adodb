'use strict';

const debug = require('debug')('adodb:provider:factory');
const ProviderLocal = require('./provider-local');
const ProviderRemote = require('./provider-remote');
const parseConnStr = require('./parse-conn-str');

async function getProvider(options) {
    debug('getProvider');

    debug(options.connString);
    let opts = parseConnStr(options.connString);
    debug(opts);

    let provider;
    if (opts.remote === true) {
        debug('remote');
        options.remote = true;
        options.host = opts.host;
        options.port = opts.port;

        provider = new ProviderRemote(options);
    } else {
        debug('local');
        provider = new ProviderLocal(options);
    }

    await provider.init();

    return provider;
}

module.exports = getProvider;
