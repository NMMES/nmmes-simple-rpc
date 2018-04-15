'use strict';

const WebSocket = require('ws');
const util = require('util');

const TIMEOUT = 10000; // milliseconds

module.exports = class Server extends WebSocket.Server {
    constructor(options, cb) {
        super(options, cb);
        super.on('connection', (socket) => {
            if (socket.protocol === 'nmmes-rpc')
                this.initSocket(socket);
        });
        this._waiting = {};
        this._subscribers = {};
        this._registeredFunctions = {};
    }
    initSocket(socket) {
        // console.debug('Socket connected!');
        socket.sendAsync = util.promisify(socket.send.bind(socket));
        socket._messageId = 0;
        socket.messageId = () => ++socket._messageId;
        socket.on('message', async msg => {
            // console.debug(`Got new message:`, msg);
            try {
                try {
                    msg = JSON.parse(msg);
                } catch (e) {
                    console.error(e);
                    return;
                }

                if (msg.type === 'response') {
                    if (!this._waiting[msg.id]) return; // We got a response that we no longer want
                    if (msg.error) return this._waiting[msg.id].rej(msg.error);
                    // console.debug(`Got response to [${msg.id}]:`, msg.result);
                    this._waiting[msg.id].res(msg.result);
                    return;
                }

                if (msg.type === 'call') {
                    if (msg.namespace === '__subscribe__') {
                        if (!this._subscribers[msg.data[0]])
                            this._subscribers[msg.data[0]] = new Set([socket]);
                        else
                            this._subscribers[msg.data[0]].add(socket);
                        // console.debug(`Subscribed socket to ${msg.data[0]}`);
                        return socket.send(JSON.stringify({
                            type: 'response',
                            result: [true],
                            id: msg.id
                        }));
                    }
                    if (msg.namespace === '__unsubscribe__') {
                        this._subscribers[msg.data[0]].delete(socket);
                        // console.debug(`Unsubscribed socket from ${msg.data[0]}`);
                        return socket.send(JSON.stringify({
                            type: 'response',
                            result: [true],
                            id: msg.id
                        }));
                    }

                    if (typeof this._registeredFunctions[msg.namespace] !== 'function')
                        throw new Error(`Call to unregistered namespace "${msg.namespace}".`);

                    let data = (await this._registeredFunctions[msg.namespace](msg.data)) || [];
                    // console.debug(`Responding to`, msg.namespace, 'with', data);
                    return socket.send(JSON.stringify({
                        type: 'response',
                        result: Array.isArray(data) ? data : [data],
                        id: msg.id
                    }));
                }
            } catch (e) {
                // console.error(`Error running`, msg.namespace, ':', e);
                return socket.send(JSON.stringify({
                    type: 'response',
                    error: e.message,
                    id: msg.id
                }));
            }
        });
        socket.call = async (namespace, data, options) => {
            // console.debug(`Calling`, namespace, `with`, data);
            const id = socket.messageId();
            await socket.sendAsync(JSON.stringify({
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
        };
    }
    register(namespace, func) {
        this._registeredFunctions[namespace] = async data => {
            // console.debug(`Evaluating`, namespace, `with`, data);
            return await func.apply(this, data);
        };
    }
    publish(namespace, data) {
        // console.debug(`Publishing to '${namespace}' with`, data);
        this._subscribers[namespace].forEach(function each(socket) {
            if (socket.readyState === WebSocket.OPEN) {
                return socket.send(JSON.stringify({
                    type: 'publish',
                    data: Array.isArray(data) ? data : [data],
                    namespace
                }));
            }
        });
    }
}
