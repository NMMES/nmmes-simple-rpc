'use strict';
const RPC = require('..');
const http = require('http');

const httpServer = http.createServer();

const server = new RPC.Server({
    server: httpServer
});

server.register('math.addition.2', (num1, num2) => {
    return num1 + num2;
});
server.register('user.image.upload', (filename, buffer) => {
    console.log(`Creating file with name ${filename} for`, buffer);
});

httpServer.listen(() => {
    console.log('Server listening...');
    const client = new RPC.Client(`ws://${server.address()}:${server.address().port}`);

    client.on('open', async () => {
        console.log('Connected!');
        console.log('1 + 2 =', await client.call('math.addition.2', [1, 2]));
        console.log('Uploading image: ', await client.call('user.image.upload', ['myavatar', Buffer.allocUnsafe(10)]));
    });
});
