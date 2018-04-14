let ex = {
    Client: require('./client.js')
};
if (typeof window === 'undefined')
    ex.Server = require('./server.js');

module.exports = ex;
