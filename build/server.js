'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.Server = exports.RequestError = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _underscore = require('underscore');

var _underscore2 = _interopRequireDefault(_underscore);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _tools = require('./tools');

var _handler_forward = require('./handler_forward');

var _handler_forward2 = _interopRequireDefault(_handler_forward);

var _handler_tunnel_direct = require('./handler_tunnel_direct');

var _handler_tunnel_direct2 = _interopRequireDefault(_handler_tunnel_direct);

var _handler_tunnel_chain = require('./handler_tunnel_chain');

var _handler_tunnel_chain2 = _interopRequireDefault(_handler_tunnel_chain);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

// TODO:
// - Fail gracefully if target proxy fails (invalid credentials or non-existent)
// - Implement this requirement from rfc7230
//   "A proxy MUST forward unrecognized header fields unless the field-name
//    is listed in the Connection header field (Section 6.1) or the proxy
//    is specifically configured to block, or otherwise transform, such
//    fields.  Other recipients SHOULD ignore unrecognized header fields.
//    These requirements allow HTTP's functionality to be enhanced without
//    requiring prior update of deployed intermediaries."
// - Add param to prepareRequestFunction() that would allow the caller to kill a connection

// TODO:
// - Use connection pooling and maybe other stuff from:
// https://github.com/request/tunnel-agent/blob/master/index.js
// https://github.com/request/request/blob/master/lib/tunnel.js

var DEFAULT_AUTH_REALM = 'ProxyChain';
var DEFAULT_PROXY_SERVER_PORT = 8000;
var DEFAULT_TARGET_PORT = 80;

var REQUEST_ERROR_NAME = 'RequestError';

/**
 * Represents custom request error. The message is emitted as HTTP response
 * with a specific HTTP code and headers.
 * If this error is thrown from the `prepareRequestFunction` function,
 * the message and status code is sent to client.
 * By default, the response will have Content-Type: text/plain
 * and for the 407 status the Proxy-Authenticate header will be added.
 */

var RequestError = exports.RequestError = function (_Error) {
    _inherits(RequestError, _Error);

    function RequestError(message, statusCode, headers) {
        _classCallCheck(this, RequestError);

        var _this = _possibleConstructorReturn(this, (RequestError.__proto__ || Object.getPrototypeOf(RequestError)).call(this, message));

        _this.name = REQUEST_ERROR_NAME;
        _this.statusCode = statusCode;
        _this.headers = headers;

        Error.captureStackTrace(_this, RequestError);
        return _this;
    }

    return RequestError;
}(Error);

/**
 * Represents the proxy server.
 * It emits 'requestFailed' event on unexpected request errors.
 * It emits 'connectionClosed' event when connection to proxy server is closed.
 */


var Server = exports.Server = function (_EventEmitter) {
    _inherits(Server, _EventEmitter);

    /**
     * Initializes a new instance of Server class.
     * @param options
     * @param [options.port] Port where the server the server will listen. By default 8000.
     * @param [options.prepareRequestFunction] Custom function to authenticate proxy requests
     * and provide URL to chained upstream proxy. It accepts a single parameter which is an object:
     * `{ connectionId: Number, request: Object, username: String, password: String, hostname: String, port: Number, isHttp: Boolean }`
     * and returns an object (or promise resolving to the object) with following form:
     * `{ requestAuthentication: Boolean, upstreamProxyUrl: String }`
     * If `upstreamProxyUrl` is false-ish value, no upstream proxy is used.
     * If `prepareRequestFunction` is not set, the proxy server will not require any authentication
     * and with not use any upstream proxy.
     * @param [options.authRealm] Realm used in the Proxy-Authenticate header and also in the 'Server' HTTP header. By default it's `ProxyChain`.
     * @param [options.verbose] If true, the server logs
     */
    function Server(options) {
        _classCallCheck(this, Server);

        var _this2 = _possibleConstructorReturn(this, (Server.__proto__ || Object.getPrototypeOf(Server)).call(this));

        options = options || {};

        _this2.port = options.port || DEFAULT_PROXY_SERVER_PORT;
        _this2.prepareRequestFunction = options.prepareRequestFunction;
        _this2.authRealm = options.authRealm || DEFAULT_AUTH_REALM;
        _this2.verbose = !!options.verbose;

        // Key is handler ID, value is HandlerXxx instance
        _this2.handlers = {};
        _this2.lastHandlerId = 0;

        _this2.server = _http2.default.createServer();
        _this2.server.on('clientError', _this2.onClientError.bind(_this2));
        _this2.server.on('request', _this2.onRequest.bind(_this2));
        _this2.server.on('connect', _this2.onConnect.bind(_this2));

        _this2.stats = {
            httpRequestCount: 0,
            connectRequestCount: 0
        };
        return _this2;
    }

    _createClass(Server, [{
        key: 'log',
        value: function log(handlerId, str) {
            if (this.verbose) {
                var logPrefix = handlerId ? handlerId + ' | ' : '';
                console.log('Server[' + this.port + ']: ' + logPrefix + str);
            }
        }
    }, {
        key: 'onClientError',
        value: function onClientError(err, socket) {
            this.log(null, 'onClientError: ' + err);
            this.sendResponse(socket, 400, null, 'Invalid request');
        }

        /**
         * Handles normal HTTP request by forwarding it to target host or the upstream proxy.
         */

    }, {
        key: 'onRequest',
        value: function onRequest(request, response) {
            var _this3 = this;

            var handlerOptions = void 0;
            this.prepareRequestHandling(request).then(function (handlerOpts) {
                handlerOpts.srcResponse = response;
                handlerOptions = handlerOpts;
                _this3.log(handlerOpts.id, 'Using HandlerForward');
                var handler = new _handler_forward2.default(handlerOpts);
                _this3.handlerRun(handler);
            }).catch(function (err) {
                _this3.failRequest(request, err, handlerOptions);
            });
        }

        /**
         * Handles HTTP CONNECT request by setting up a tunnel either to target host or to the upstream proxy.
         * @param request
         * @param head
         */

    }, {
        key: 'onConnect',
        value: function onConnect(request) {
            var _this4 = this;

            var handlerOptions = void 0;
            this.prepareRequestHandling(request).then(function (handlerOpts) {
                handlerOptions = handlerOpts;

                var handler = void 0;
                if (handlerOpts.upstreamProxyUrlParsed) {
                    _this4.log(handlerOpts.id, 'Using HandlerTunnelChain');
                    handler = new _handler_tunnel_chain2.default(handlerOpts);
                } else {
                    _this4.log(handlerOpts.id, 'Using HandlerTunnelDirect');
                    handler = new _handler_tunnel_direct2.default(handlerOpts);
                }

                _this4.handlerRun(handler);
            }).catch(function (err) {
                _this4.failRequest(request, err, handlerOptions);
            });
        }

        /**
         * Authenticates a new request and determines upstream proxy URL using the user function.
         * Returns a promise resolving to an object that can be passed to construcot of one of the HandlerXxx classes.
         * @param request
         */

    }, {
        key: 'prepareRequestHandling',
        value: function prepareRequestHandling(request) {
            var _this5 = this;

            // console.log('XXX prepareRequestHandling');
            // console.dir(_.pick(request, 'url', 'method'));
            // console.dir(url.parse(request.url));

            var result = {
                server: this,
                id: ++this.lastHandlerId,
                srcRequest: request,
                trgParsed: null,
                upstreamProxyUrlParsed: null
            };

            this.log(result.id, '!!! Handling ' + request.method + ' ' + request.url + ' HTTP/' + request.httpVersion);

            var socket = request.socket;
            var isHttp = false;

            return _bluebird2.default.resolve().then(function () {
                // console.dir(_.pick(request, 'url', 'headers', 'method'));
                // Determine target hostname and port
                if (request.method === 'CONNECT') {
                    // The request should look like:
                    //   CONNECT server.example.com:80 HTTP/1.1
                    // Note that request.url contains the "server.example.com:80" part
                    result.trgParsed = (0, _tools.parseHostHeader)(request.url);
                    _this5.stats.connectRequestCount++;
                } else {
                    // The request should look like:
                    //   GET http://server.example.com:80/some-path HTTP/1.1
                    // Note that RFC 7230 says:
                    // "When making a request to a proxy, other than a CONNECT or server-wide
                    //  OPTIONS request (as detailed below), a client MUST send the target
                    //  URI in absolute-form as the request-target"
                    var parsed = (0, _tools.parseUrl)(request.url);

                    // If srcRequest.url is something like '/some-path', this is most likely a normal HTTP request
                    if (!parsed.protocol) {
                        throw new RequestError('Hey, good try, but I\'m a HTTP proxy, not an ordinary web server :)', 400);
                    }
                    // Only HTTP is supported, other protocols such as HTTP or FTP must use the CONNECT method
                    if (parsed.protocol !== 'http:') {
                        throw new RequestError('Only HTTP protocol is supported (was ' + parsed.protocol + ')', 400);
                    }

                    result.trgParsed = parsed;
                    isHttp = true;

                    _this5.stats.httpRequestCount++;
                }
                result.trgParsed.port = result.trgParsed.port || DEFAULT_TARGET_PORT;

                // Authenticate the request using a user function (if provided)
                if (!_this5.prepareRequestFunction) return { requestAuthentication: false, upstreamProxyUrlParsed: null };

                // Pause the socket so that no data is lost
                socket.pause();

                var funcOpts = {
                    connectionId: result.id,
                    request: request,
                    username: null,
                    password: null,
                    hostname: result.trgParsed.hostname,
                    port: result.trgParsed.port,
                    isHttp: isHttp
                };

                var proxyAuth = request.headers['proxy-authorization'];
                if (proxyAuth) {
                    var auth = (0, _tools.parseProxyAuthorizationHeader)(proxyAuth);
                    if (!auth) {
                        throw new RequestError('Invalid "Proxy-Authorization" header', 400);
                    }
                    if (auth.type !== 'Basic') {
                        throw new RequestError('The "Proxy-Authorization" header must have the "Basic" type.', 400);
                    }
                    funcOpts.username = auth.username;
                    funcOpts.password = auth.password;
                }
                // User function returns a result directly or a promise
                return _this5.prepareRequestFunction(funcOpts);
            }).then(function (funcResult) {
                // If not authenticated, request client to authenticate
                if (funcResult && funcResult.requestAuthentication) {
                    throw new RequestError(funcResult.failMsg || 'Proxy credentials required.', 407);
                }

                if (funcResult && funcResult.upstreamProxyUrl) {
                    result.upstreamProxyUrlParsed = (0, _tools.parseUrl)(funcResult.upstreamProxyUrl);

                    if (result.upstreamProxyUrlParsed) {
                        if (!result.upstreamProxyUrlParsed.hostname || !result.upstreamProxyUrlParsed.port) {
                            throw new Error('Invalid "upstreamProxyUrl" provided: URL must have hostname and port');
                        }
                        if (result.upstreamProxyUrlParsed.scheme !== 'http') {
                            throw new Error('Invalid "upstreamProxyUrl" provided: URL must have the "http" scheme');
                        }
                    }
                }

                if (result.upstreamProxyUrlParsed) {
                    _this5.log(result.id, 'Using upstream proxy ' + (0, _tools.redactParsedUrl)(result.upstreamProxyUrlParsed));
                }

                return result;
            }).finally(function () {
                if (_this5.prepareRequestFunction) socket.resume();
            });
        }
    }, {
        key: 'handlerRun',
        value: function handlerRun(handler) {
            var _this6 = this;

            this.handlers[handler.id] = handler;

            handler.once('close', function (_ref) {
                var stats = _ref.stats;

                _this6.emit('connectionClosed', {
                    connectionId: handler.id,
                    stats: stats
                });
                delete _this6.handlers[handler.id];
                _this6.log(handler.id, '!!! Closed and removed from server');
            });

            handler.run();
        }

        /**
         * Sends a HTTP error response to the client.
         * @param request
         * @param err
         */

    }, {
        key: 'failRequest',
        value: function failRequest(request, err, handlerOptions) {
            var handlerId = handlerOptions ? handlerOptions.id : null;
            if (err.name === REQUEST_ERROR_NAME) {
                this.log(handlerId, 'Request failed (status ' + err.statusCode + '): ' + err.message);
                this.sendResponse(request.socket, err.statusCode, err.headers, err.message);
            } else {
                this.log(handlerId, 'Request failed with unknown error: ' + (err.stack || err));
                this.sendResponse(request.socket, 500, null, 'Internal error in proxy server');
                this.emit('requestFailed', err);
            }
            // emit connection closed if request fails and connection was already reported
            if (handlerOptions) {
                this.log(handlerId, 'Closed because request failed with error');
                this.emit('connectionClosed', {
                    connectionId: handlerOptions.id,
                    stats: { srcTxBytes: 0, srcRxBytes: 0 }
                });
            }
        }

        /**
         * Sends a simple HTTP response to the client and forcibly closes the connection.
         * @param socket
         * @param statusCode
         * @param headers
         * @param message
         */

    }, {
        key: 'sendResponse',
        value: function sendResponse(socket, statusCode, headers, message) {
            try {
                headers = headers || {};

                if (!headers['Content-Type']) {
                    headers['Content-Type'] = 'text/html; charset=utf-8';
                }
                if (statusCode === 407 && !headers['Proxy-Authenticate']) {
                    headers['Proxy-Authenticate'] = 'Basic realm="' + this.authRealm + '"';
                }
                if (!headers.Server) {
                    headers.Server = this.authRealm;
                }
                // These headers are required by PhantomJS, otherwise the connection would timeout!
                if (!headers.Connection) {
                    headers.Connection = 'close';
                }
                if (!headers['Content-Length']) {
                    headers['Content-Length'] = Buffer.byteLength(message);
                }

                var msg = 'HTTP/1.1 ' + statusCode + ' ' + _http2.default.STATUS_CODES[statusCode] + '\r\n';
                _underscore2.default.each(headers, function (value, key) {
                    msg += key + ': ' + value + '\r\n';
                });
                msg += '\r\n' + message;

                // console.log("RESPONSE:\n" + msg);

                socket.write(msg, function () {
                    socket.end();

                    // Unfortunately calling end() will not close the socket
                    // if client refuses to close it. Hence calling destroy after a short while.
                    setTimeout(function () {
                        socket.destroy();
                    }, 100);
                });
            } catch (err) {
                this.log(null, 'Unhandled error in sendResponse(), will be ignored: ' + (err.stack || err));
            }
        }

        /**
         * Starts listening at a port specified in the constructor.
         * @param callback Optional callback
         * @return {*}
         */

    }, {
        key: 'listen',
        value: function listen(callback) {
            var _this7 = this;

            return new _bluebird2.default(function (resolve, reject) {
                // Unfortunately server.listen() is not a normal function that fails on error,
                // so we need this trickery
                var onError = function onError(err) {
                    _this7.log(null, 'Listen failed: ' + err);
                    removeListeners();
                    reject(err);
                };
                var onListening = function onListening() {
                    _this7.log(null, 'Listening...');
                    removeListeners();
                    resolve();
                };
                var removeListeners = function removeListeners() {
                    _this7.server.removeListener('error', onError);
                    _this7.server.removeListener('listening', onListening);
                };

                _this7.server.on('error', onError);
                _this7.server.on('listening', onListening);
                _this7.server.listen(_this7.port);
            }).nodeify(callback);
        }

        /**
         * Gets array of IDs of all active connections.
         * @returns {*}
         */

    }, {
        key: 'getConnectionIds',
        value: function getConnectionIds() {
            return _underscore2.default.keys(this.handlers);
        }

        /**
         * Gets data transfer statistics of a specific proxy connection.
         * @param {Number} connectionId ID of the connection handler.
         * It is passed to `prepareRequestFunction` function.
         * @return {Object} statistics { srcTxBytes, srcRxBytes, trgTxBytes, trgRxBytes }
         */

    }, {
        key: 'getConnectionStats',
        value: function getConnectionStats(connectionId) {
            var handler = this.handlers && this.handlers[connectionId];
            if (!handler) return undefined;

            return handler.getStats();
        }

        /**
         * Closes the proxy server.
         * @param [closeConnections] If true, then all the pending connections from clients
         * to targets and upstream proxies will be forcibly aborted.
         * @param callback
         */

    }, {
        key: 'close',
        value: function close(closeConnections, callback) {
            if (typeof closeConnections === 'function') {
                callback = closeConnections;
                closeConnections = false;
            }

            if (closeConnections) {
                this.log(null, 'Closing pending handlers');
                var count = 0;
                _underscore2.default.each(this.handlers, function (handler) {
                    count++;
                    handler.close();
                });
                this.log(null, 'Destroyed ' + count + ' pending handlers');
            }

            // TODO: keep track of all handlers and close them if closeConnections=true
            if (this.server) {
                var server = this.server;
                this.server = null;
                return _bluebird2.default.promisify(server.close).bind(server)().nodeify(callback);
            }
        }
    }]);

    return Server;
}(_events2.default);