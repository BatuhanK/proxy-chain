'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _handler_base = require('./handler_base');

var _handler_base2 = _interopRequireDefault(_handler_base);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

// import { tee } from './tools';

/* globals Buffer */

/**
 * Represents a connection from source client to an external proxy using HTTP CONNECT tunnel.
 */
var HandlerTunnelChain = function (_HandlerBase) {
    _inherits(HandlerTunnelChain, _HandlerBase);

    function HandlerTunnelChain(options) {
        _classCallCheck(this, HandlerTunnelChain);

        var _this = _possibleConstructorReturn(this, (HandlerTunnelChain.__proto__ || Object.getPrototypeOf(HandlerTunnelChain)).call(this, options));

        if (!_this.upstreamProxyUrlParsed) throw new Error('The "upstreamProxyUrlParsed" option is required');

        _this.bindHandlersToThis(['onTrgRequestConnect', 'onTrgRequestAbort', 'onTrgRequestError']);
        return _this;
    }

    _createClass(HandlerTunnelChain, [{
        key: 'run',
        value: function run() {
            this.log('Connecting to upstream proxy...');

            var options = {
                method: 'CONNECT',
                hostname: this.upstreamProxyUrlParsed.hostname,
                port: this.upstreamProxyUrlParsed.port,
                path: this.trgParsed.hostname + ':' + this.trgParsed.port,
                headers: {}
            };

            this.maybeAddProxyAuthorizationHeader(options.headers);

            this.trgRequest = _http2.default.request(options);

            this.trgRequest.once('connect', this.onTrgRequestConnect);
            this.trgRequest.once('abort', this.onTrgRequestAbort);
            this.trgRequest.once('error', this.onTrgRequestError);
            this.trgRequest.on('socket', this.onTrgSocket);

            // Send the data
            this.trgRequest.end();
        }
    }, {
        key: 'onTrgRequestConnect',
        value: function onTrgRequestConnect(response, socket) {
            if (this.isClosed) return;
            this.log('Connected to upstream proxy');

            if (this.checkUpstreamProxy407(response)) return;

            this.srcGotResponse = true;
            this.srcResponse.removeListener('finish', this.onSrcResponseFinish);
            this.srcResponse.writeHead(200, 'Connection established');

            // TODO: ???
            // this.response.writeHead(response.statusCode, response.statusMessage);

            // TODO: attach handlers to trgSocket ???
            this.trgSocket = socket;

            // HACK: force a flush of the HTTP header
            this.srcResponse._send('');

            // relinquish control of the `socket` from the ServerResponse instance
            this.srcResponse.detachSocket(this.srcSocket);

            // nullify the ServerResponse object, so that it can be cleaned
            // up before this socket proxying is completed
            this.srcResponse = null;

            // Setup bi-directional tunnel
            this.trgSocket.pipe(this.srcSocket);
            this.srcSocket.pipe(this.trgSocket);
            // this.trgSocket.pipe(tee('to src')).pipe(this.srcSocket);
            // this.srcSocket.pipe(tee('to trg')).pipe(this.trgSocket);
        }
    }, {
        key: 'onTrgRequestAbort',
        value: function onTrgRequestAbort() {
            if (this.isClosed) return;
            this.log('Target aborted');
            this.close();
        }
    }, {
        key: 'onTrgRequestError',
        value: function onTrgRequestError(err) {
            if (this.isClosed) return;
            this.log('Target request failed: ' + (err.stack || err));
            this.fail(err);
        }
    }]);

    return HandlerTunnelChain;
}(_handler_base2.default);

exports.default = HandlerTunnelChain;