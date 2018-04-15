'use strict';

if (typeof window === 'undefined') {
    var WebSocket = require('ws');
    var promisify = require('util').promisify;
} else {
    var WebSocket = window.WebSocket;
    var promisify = require("es6-promisify").promisify;
}

const TIMEOUT = 10000; // milliseconds

module.exports = class Client extends WebSocket {
    constructor(address, protocols, options) {
        super(address, ['nmmes-rpc'], options);
        this._messageId = 0;
        this._registeredFunctions = {};
        this._subscriptions = {};
        this._waiting = {};
        this._queue = [];
        this.initReceiver();
        super.addEventListener('open', this.flushQueue)
    }
    initReceiver() {
        const messageHandler = async msg => {
            // console.debug(`Got new message:`, msg);
            try {
                msg = JSON.parse(msg);
            } catch (e) {
                // console.debug(`Invalid message:`, msg);
                return console.error(e);
            }

            if (msg.type === 'response') {
                if (!this._waiting[msg.id]) return; // We got a response that we no longer want
                if (typeof msg.error != 'undefined') return this._waiting[msg.id].rej(msg.error);
                // console.debug(`Got response to [${msg.id}]:`, msg.result);
                this._waiting[msg.id].res(msg.result);
                delete this._waiting[msg.id];
                return;
            }

            if (msg.type === 'call') {
                try {
                    let data = (await this._registeredFunctions[msg.namespace](msg)) || [];
                    // console.debug(`Responding to`, msg.namespace, 'with', data);
                    return super.send(JSON.stringify({
                        type: 'response',
                        result: Array.isArray(data) ? data : [data],
                        id: msg.id
                    }));
                } catch (e) {
                    console.error(`Error running`, msg.namespace, ':', e);
                    return super.send(JSON.stringify({
                        type: 'response',
                        error: e,
                        id: msg.id
                    }));
                }
            }

            if (msg.type === 'publish') {
                // console.debug(`Got publish for '${msg.namespace}':`, msg.data);
                this._subscriptions[msg.namespace](msg.data);
                return;
            }
        };
        if (super.on)
            super.on('message', messageHandler);
        else
            super.onmessage = e => {messageHandler(e.data)};
    }
    flushQueue() {
        while (this._queue.length > 0) {
            this._queue.shift()();
        }
    }
    register(namespace, func) {
        this._registeredFunctions[namespace] = async data => {
            // console.debug(`Evaluating '${namespace}' with`, data);
            return await func.apply(this, data);
        };
    }
    async call(namespace, data = [], options) {
        // Check if socket is connected, if not, wait until it is
        if (this.readyState != 1) {
            // console.debug(`Call queued because socket is not connected.`);
            await new Promise(res => {
                this._queue.push(res);
            });
        }
        // console.debug(`Calling '${namespace}' with`, data);
        const id = this.messageId;
        const payload = {
            namespace,
            data: Array.isArray(data) ? data : [data],
            type: 'call',
            id
        };
        // console.debug(`Payload:`, payload);
        this.send(JSON.stringify(payload), options);

        let timeout;
        try {
            return await Promise.race([
                new Promise((res, rej) => {
                    timeout = setTimeout(rej.bind(this, new Error(`Call to "${namespace}" timed out.`)), TIMEOUT);
                }),
                new Promise((res, rej) => {
                    this._waiting[id] = {
                        res,
                        rej
                    };
                })
            ]);
        } catch (e) {
            throw e;
        } finally {
            clearTimeout(timeout);
            delete this._waiting[id];
        }
    }
    async subscribe(namespace, func) {
        this._subscriptions[namespace] = func;
        await this.call('__subscribe__', namespace);
    }
    async unsubscribe(namespace) {
        await this.call('__unsubscribe__', namespace);
        delete this._subscriptions[namespace];
    }
    get messageId() {
        return ++this._messageId;
    }
}
