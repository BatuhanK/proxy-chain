'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _handler_base = require('./handler_base');

var _handler_base2 = _interopRequireDefault(_handler_base);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * Represents a proxied connection from source to the target HTTPS server.
 */
var HandlerTunnelDirect = function (_HandlerBase) {
    _inherits(HandlerTunnelDirect, _HandlerBase);

    function HandlerTunnelDirect(options) {
        _classCallCheck(this, HandlerTunnelDirect);

        var _this = _possibleConstructorReturn(this, (HandlerTunnelDirect.__proto__ || Object.getPrototypeOf(HandlerTunnelDirect)).call(this, options));

        _this.bindHandlersToThis(['onTrgSocketConnect']);
        return _this;
    }

    _createClass(HandlerTunnelDirect, [{
        key: 'run',
        value: function run() {
            this.log('Connecting to target ' + this.trgParsed.hostname + ':' + this.trgParsed.port);

            var socket = _net2.default.createConnection(this.trgParsed.port, this.trgParsed.hostname);
            socket.once('connect', this.onTrgSocketConnect);

            this.onTrgSocket(socket);
        }
    }, {
        key: 'onTrgSocketConnect',
        value: function onTrgSocketConnect() {
            if (this.isClosed) return;
            this.log('Connected');

            this.srcGotResponse = true;

            this.srcResponse.removeListener('finish', this.onSrcResponseFinish);
            this.srcResponse.writeHead(200, 'Connection established');

            // HACK: force a flush of the HTTP header
            this.srcResponse._send('');

            // Relinquish control of the socket from the ServerResponse instance
            this.srcResponse.detachSocket(this.srcSocket);

            // ServerResponse is no longer needed
            this.srcResponse = null;

            // Setup bi-directional tunnel
            this.trgSocket.pipe(this.srcSocket);
            this.srcSocket.pipe(this.trgSocket);
            // this.trgSocket.pipe(tee('to src')).pipe(this.srcSocket);
            // this.srcSocket.pipe(tee('to trg')).pipe(this.trgSocket);
        }
    }]);

    return HandlerTunnelDirect;
}(_handler_base2.default);

exports.default = HandlerTunnelDirect;