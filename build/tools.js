'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.addHeader = exports.parseProxyAuthorizationHeader = exports.redactParsedUrl = exports.redactUrl = exports.parseUrl = exports.isInvalidHeader = exports.isHopByHopHeader = exports.parseHostHeader = undefined;

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _http_common = require('_http_common');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-line
// import through from 'through';


var HOST_HEADER_REGEX = /^((([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]))(:([0-9]+))?$/;

/**
 * Parsed the 'Host' HTTP header and returns an object with { host: String, port: Number }.
 * For example, for 'www.example.com:80' it returns { host: 'www.example.com', port: 80 }.
 * If port is not present, the function
 * If the header is invalid, returns null.
 * @param hostHeader
 * @return {*}
 */
var parseHostHeader = exports.parseHostHeader = function parseHostHeader(hostHeader) {
    var matches = HOST_HEADER_REGEX.exec(hostHeader || '');
    if (!matches) return null;

    var hostname = matches[1];
    if (hostname.length > 255) return null;

    var port = null;
    if (matches[5]) {
        port = parseInt(matches[6], 10);
        if (!(port > 0 && port <= 65535)) return null;
    }

    return { hostname: hostname, port: port };
};

var HOP_BY_HOP_HEADERS = ['Connection', 'Keep-Alive', 'Proxy-Authenticate', 'Proxy-Authorization', 'TE', 'Trailers', 'Transfer-Encoding', 'Upgrade'];

var HOP_BY_HOP_HEADERS_REGEX = new RegExp('^(' + HOP_BY_HOP_HEADERS.join('|') + ')$', 'i');

var isHopByHopHeader = exports.isHopByHopHeader = function isHopByHopHeader(header) {
    return HOP_BY_HOP_HEADERS_REGEX.test(header);
};

// This code is based on Node.js' validateHeader() function from _http_outgoing.js module
// (see https://github.com/nodejs/node/blob/189d29f39e6de9ccf10682bfd1341819b4a2291f/lib/_http_outgoing.js#L485)
var isInvalidHeader = exports.isInvalidHeader = function isInvalidHeader(name, value) {
    // NOTE: These are internal Node.js functions, they might stop working in the future!
    return typeof name !== 'string' || !name || !(0, _http_common._checkIsHttpToken)(name) || value === undefined || (0, _http_common._checkInvalidHeaderChar)(value);
};

/**
 * Sames are Node's url.parse() just adds the 'username', 'password' and 'scheme' fields.
 * Also this method makes sure "port" is a number rather than a string.
 * Note that `scheme` is always lower-cased (e.g. `ftp`).
 * @param url
 * @ignore
 */
var parseUrl = exports.parseUrl = function parseUrl(url) {
    var parsed = _url2.default.parse(url);

    parsed.username = null;
    parsed.password = null;
    parsed.scheme = null;

    if (parsed.auth) {
        var matches = /^([^:]+)(:?)(.*)$/.exec(parsed.auth);
        if (matches && matches.length === 4) {
            parsed.username = matches[1];
            if (matches[2] === ':') parsed.password = matches[3];
        }
    }

    if (parsed.protocol) {
        var _matches = /^([a-z0-9]+):$/i.exec(parsed.protocol);
        if (_matches && _matches.length === 2) {
            parsed.scheme = _matches[1];
        }
    }

    if (parsed.port) {
        parsed.port = parseInt(parsed.port, 10);
    }

    return parsed;
};

/**
 * Redacts password from a URL, so that it can be shown in logs, results etc.
 * For example, converts URL such as
 * 'https://username:password@www.example.com/path#hash'
 * to 'https://username:<redacted>@www.example.com/path#hash'
 * @param url URL, it must contain at least protocol and hostname
 * @param passwordReplacement The string that replaces password, by default it is '<redacted>'
 * @returns {string}
 * @ignore
 */
var redactUrl = exports.redactUrl = function redactUrl(url, passwordReplacement) {
    return redactParsedUrl(parseUrl(url), passwordReplacement);
};

var redactParsedUrl = exports.redactParsedUrl = function redactParsedUrl(parsedUrl) {
    var passwordReplacement = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '<redacted>';

    var p = parsedUrl;
    var auth = null;
    if (p.username) {
        if (p.password) {
            auth = p.username + ':' + passwordReplacement;
        } else {
            auth = '' + p.username;
        }
    }
    return p.protocol + '//' + (auth || '') + (auth ? '@' : '') + p.host + (p.path || '') + (p.hash || '');
};

var PROXY_AUTH_HEADER_REGEX = /^([a-z0-9-]+) ([a-z0-9+/=]+)$/i;

/**
 * Parses the content of the Proxy-Authorization HTTP header.
 * @param header
 * @returns {*} Object with fields { type: String, username: String, password: String }
 * or null if string parsing failed. Note that password and username might be empty strings.
 */
var parseProxyAuthorizationHeader = exports.parseProxyAuthorizationHeader = function parseProxyAuthorizationHeader(header) {
    var matches = PROXY_AUTH_HEADER_REGEX.exec(header);
    if (!matches) return null;

    var auth = Buffer.from(matches[2], 'base64').toString();
    if (!auth) return null;

    var index = auth.indexOf(':');
    return {
        type: matches[1],
        username: index >= 0 ? auth.substr(0, index) : auth,
        password: index >= 0 ? auth.substr(index + 1) : ''
    };
};

/**
 * Works like Bash tee, but instead of passing output to file,
 * passes output to log
 *
 * @param   {String}   name          identifier
 * @param   {Boolean}  initialOnly   log only initial chunk of data
 * @return  {through}                duplex stream (pipe)

export const tee = (name, initialOnly = true) => {
    console.log('tee');
    let maxChunks = 2;
    const duplex = through((chunk) => {
        if (maxChunks || !initialOnly) {
            // let msg = chunk.toString();
            // msg += '';
            maxChunks--;
            console.log(`pipe: ${JSON.stringify({
                context: name,
                chunkHead: chunk.toString().slice(0, 100),
            })}`);
        }
        duplex.queue(chunk);
    });

    return duplex;
};
*/

var addHeader = exports.addHeader = function addHeader(headers, name, value) {
    if (headers[name] === undefined) {
        headers[name] = value;
    } else if (Array.isArray(headers[name])) {
        headers[name].push(value);
    } else {
        headers[name] = [headers[name], value];
    }
};