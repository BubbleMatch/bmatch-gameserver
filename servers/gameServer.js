const https = require('https');
const { Server } = require("socket.io");
const {joinServer, disconnectServer} = require("../sockets/gamews");

function startGameServer(app, options, consul, redisClient) {
    const server = https.createServer(options, app);
    const io = new Server(server, {
        cors: {
            origin: '*'
        }
    });

    io.on('connection', socket => {
        joinServer(io, socket, consul, redisClient);
        disconnectServer(io, socket, redisClient);
    });

    server.listen(8005, () => {
        console.log("Game Socket.IO server is running on 8005");
    });
}

module.exports = { startGameServer };
