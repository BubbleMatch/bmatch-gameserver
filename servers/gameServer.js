const https = require('https');
const http = require('http');
const { Server } = require("socket.io");
const {joinServer, disconnectServer, openedBubble, chatMessage, ping, initExpirationSubscriber} = require("../sockets/gamews");

const useTLS = process.env.USE_TLS;

function startGameServer(app, options, consul, redisClient) {

    const server = useTLS
        ? https.createServer(options, app)
        : http.createServer(app);

    const io = new Server(server, {
        cors: {
            origin: '*'
        }
    });

    initExpirationSubscriber(redisClient, io);

    io.on('connection', async socket => {
        joinServer(io, socket, consul, redisClient);
        disconnectServer(io, socket, redisClient);
        openedBubble(io, socket, consul, redisClient);
        chatMessage(io, socket, consul, redisClient);
        ping(socket, io);
    });

    server.listen(8005, () => {
        console.log("Game Socket.IO server is running on 8005");
    });
}

module.exports = { startGameServer };
