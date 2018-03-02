'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.closeAnonymizedProxy = exports.anonymizeProxy = exports.ANONYMIZED_PROXY_PORTS = undefined;

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _portastic = require('portastic');

var _portastic2 = _interopRequireDefault(_portastic);

var _server = require('./server');

var _tools = require('./tools');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Dictionary, key is value returned from anonymizeProxy(), value is Server instance.
var anonymizedProxyUrlToServer = {};

var ANONYMIZED_PROXY_PORTS = exports.ANONYMIZED_PROXY_PORTS = {
    FROM: 20000,
    TO: 60000,
    RETRY_COUNT: 10
};

var _findFreePort = function _findFreePort() {
    return _bluebird2.default.resolve(Math.floor(Math.random() * (ANONYMIZED_PROXY_PORTS.TO - ANONYMIZED_PROXY_PORTS.FROM)) + ANONYMIZED_PROXY_PORTS.FROM);
};

/**
 * Parses and validates a HTTP proxy URL. If the proxy requires authentication, then the function
 * starts an open local proxy server that forwards to the upstream proxy.
 * @param proxyUrl
 * @param callback Optional callback that receives the anonymous proxy URL
 * @return If no callback was supplied, returns a promise that resolves to a String with
 * anonymous proxy URL or the original URL if it was already anonymous.
 */
var anonymizeProxy = exports.anonymizeProxy = function anonymizeProxy(proxyUrl, callback) {
    var parsedProxyUrl = (0, _tools.parseUrl)(proxyUrl);
    if (!parsedProxyUrl.host || !parsedProxyUrl.port) {
        throw new Error('Invalid "proxyUrl" option: the URL must contain both hostname and port.');
    }
    if (parsedProxyUrl.scheme !== 'http') {
        throw new Error('Invalid "proxyUrl" option: only HTTP proxies are currently supported.');
    }

    // If upstream proxy requires no password, return it directly
    if (!parsedProxyUrl.username && !parsedProxyUrl.password) {
        return _bluebird2.default.resolve(proxyUrl).nodeify(callback);
    }

    var port = void 0;
    var server = void 0;

    var startServer = function startServer(maxRecursion) {
        return _bluebird2.default.resolve().then(function () {
            return _findFreePort();
        }).then(function (result) {
            port = result;
            server = new _server.Server({
                // verbose: true,
                port: port,
                prepareRequestFunction: function prepareRequestFunction() {
                    return {
                        requestAuthentication: false,
                        upstreamProxyUrl: proxyUrl
                    };
                }
            });

            return server.listen();
        }).catch(function (err) {
            // It might happen that the port was taken in the meantime,
            // in which case retry the search
            if (err.code === 'EADDRINUSE' && maxRecursion > 0) {
                return startServer(maxRecursion - 1);
            }
            throw err;
        });
    };

    return startServer(ANONYMIZED_PROXY_PORTS.RETRY_COUNT).then(function () {
        var url = 'http://127.0.0.1:' + port;
        anonymizedProxyUrlToServer[url] = server;
        return url;
    }).nodeify(callback);
};

/**
 * Closes anonymous proxy previously started by `anonymizeProxy()`.
 * If proxy was not found or was already closed, the function has no effect
 * and its result if `false`. Otherwise the result is `true`.
 * @param anonymizedProxyUrl
 * @param closeConnections If true, pending proxy connections are forcibly closed.
 * @param callback Optional callback
 * @returns Returns a promise if no callback was supplied
 */
var closeAnonymizedProxy = exports.closeAnonymizedProxy = function closeAnonymizedProxy(anonymizedProxyUrl, closeConnections, callback) {
    var server = anonymizedProxyUrlToServer[anonymizedProxyUrl];
    if (!server) {
        return _bluebird2.default.resolve(false).nodeify(callback);
    }

    delete anonymizedProxyUrlToServer[anonymizedProxyUrl];

    return server.close(closeConnections).then(function () {
        return true;
    }).nodeify(callback);
};