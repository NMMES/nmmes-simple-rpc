'use strict';
const RPC = require('..');
const http = require('http');
const crypto = require('crypto');

const sockPath = `/tmp/ws.${crypto.randomBytes(16).toString('hex')}.sock`;
const httpServer = http.createServer();

const server = new RPC.Server({
    server: httpServer
});

server.register('math.addition.2', (num1, num2) => {
    return num1 + num2;
});
server.register('user.image.upload', (filename, buffer) => {
    console.log(`Creating file with name ${filename} for`, buffer);
    return `example.com/user/image/${filename}`;
});

httpServer.listen(sockPath, () => {
    console.log('Socket listening...');
    const socket = `ws+unix://${server.address()}`;
    console.log(`Connecting to ${socket}`);
    const client = new RPC.Client(socket);

    client.register('connection.ping', () => {
        return 'Yes?';
    });

    client.on('open', async () => {
        console.log('Connected!');
        console.log('1 + 2 =', await client.call('math.addition.2', [1, 2]));
        console.log('Uploading image:', await client.call('user.image.upload', ['myavatar', Buffer.allocUnsafe(10)]));

        await client.subscribe('user.friend.login', friend => {
            console.log(`My friend ${friend} has logged in!`);
        });
        server.publish('user.friend.login', ['James']);

        await client.unsubscribe('user.friend.login');
        server.publish('user.friend.login', ['Dave']);

        for (let client of server.clients) {
            console.log('Pinging:', await client.call('connection.ping'));
        }

    });
});
