'use strict';

var _server = require('./server');

var _tools = require('./tools');

var _anonymize_proxy = require('./anonymize_proxy');

/* globals module */

// Publicly exported functions and classes
var ProxyChain = {
    Server: _server.Server,
    RequestError: _server.RequestError,
    parseUrl: _tools.parseUrl,
    redactUrl: _tools.redactUrl,
    redactParsedUrl: _tools.redactParsedUrl,
    anonymizeProxy: _anonymize_proxy.anonymizeProxy,
    closeAnonymizedProxy: _anonymize_proxy.closeAnonymizedProxy
};

module.exports = ProxyChain;