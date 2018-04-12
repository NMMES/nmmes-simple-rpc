'use strict';

const WebSocket = require('ws');
const util = require('util');

const TIMEOUT = 10000; // milliseconds

module.exports = class Client extends WebSocket {
    constructor(address, protocols, options) {
        super(address, ['nmmes-rpc'], options);
        this.sendAsync = util.promisify(super.send);
        this._messageId = 0;
        this._registeredFunctions = {};
        this._subscriptions = {};
        this._waiting = {};
        this.initReceiver();
    }
    initReceiver() {
        super.on('message', async msg => {
            try {
                msg = JSON.parse(msg);
            } catch (e) {
                return console.error(e);
            }

            if (msg.type === 'response') {
                if (!this._waiting[msg.id]) return; // We got a response that we no longer want
                if (msg.error) return this._waiting[msg.id].rej(msg.error);
                // console.debug(`Got response to [${msg.id}]:`, msg.result);
                this._waiting[msg.id].res(msg.result);
                delete this._waiting[msg.id];
                return;
            }

            if (msg.type === 'call') {
                try {
                    let data = await this._registeredFunctions[msg.namespace](msg);
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
        });
    }
    register(namespace, func) {
        this._registeredFunctions[namespace] = async data => {
            // console.debug(`Evaluating '${namespace}' with`, data);
            return await func.apply(this, data);
        };
    }
    async call(namespace, data, options) {
        // console.debug(`Calling '${namespace}' with`, data);
        const id = this.messageId;
        await this.sendAsync(JSON.stringify({
            namespace,
            data: Array.isArray(data) ? data : [data],
            type: 'call',
            id
        }), options);

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
