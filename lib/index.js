let exports = {
    Client: require('./client.js')
};
if (typeof window === 'undefined')
    exports.Server = require('./server.js');

module.exports = exports;
