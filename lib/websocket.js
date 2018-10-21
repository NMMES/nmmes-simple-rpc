if (typeof window === 'undefined') {
    var WebSocket = require('ws');
    var promisify = require('util').promisify;
} else {
    var WebSocket = window.WebSocket;
    var promisify = require("es6-promisify").promisify;
}

module.exports = {WebSocket, promisify};
