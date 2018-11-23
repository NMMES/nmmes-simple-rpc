const Back = require('back');
const {
    WebSocket
} = require('./websocket.js');
module.exports = class RCWebsocket {
    constructor(address, protocols, options = {}) {
        this._listeningEvents = {};
        this._address = address;
        this._protocols = protocols;
        this._options = options;
        this.timer = Back(Object.assign({
            factor: 4
        }, this._options.reconnect));
        this.connect();
        this.initSocket();
    }
    connect() {
        this.websocket = new WebSocket(this._address, this._protocols);
        this.websocket.onclose = (ev) => {
            // 1000 - Normal Closure
            // 1001 - Going Away
            if (ev.code < 1000 || ev.code > 1001)
                this.timer.backoff(this.reconnect.bind(this));
        };
        this.websocket.onopen = () => {
            this.timer = Back(this._options.reconnect)
        };
    }
    initSocket() {
        for (let [event, handlers] of Object.entries(this._listeningEvents)) {
            for (const {
                    fn,
                    options
                } of handlers) {
                // console.debug(`Adding previous event listener for "${event}".`);
                this.websocket.addEventListener(event, fn, options);
            }
        }
    }
    addEventListener(event, fn, options) {
        if (!this._listeningEvents[event])
            this._listeningEvents[event] = [{
                fn,
                options
            }];
        else
            this._listeningEvents[event].push({
                fn,
                options
            });
        // console.debug('adding event listener', event)
        this.websocket.addEventListener(event, fn, options);
    }
    removeEventListener(event, fn, options) {
        delete this._listeningEvents[event];
        this.websocket.removeEventListener(event, fn, options);
    }
    send() {
        return this.websocket.send.apply(this.websocket, arguments);
    }
    close() {
        if (this.websocket.readyState !== 2 && this.websocket.readyState !== 3)
            return this.websocket.close.apply(this.websocket, arguments);
    }
    reconnect() {
        // console.debug('websocket reconnecting')
        this.close(1000, 'logout');

        this.connect();
        this.initSocket();
    }
    get readyState() {
        return this.websocket.readyState;
    }
};
