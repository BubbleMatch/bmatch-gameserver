const https = require('https');
const { Server } = require("socket.io");
const { joinLobby, disconnectLobby, generateGame } = require("./../sockets/lobbyws");

function startLobbyServer(app, options, consul, redisClient) {
    const server = https.createServer(options, app);
    const io = new Server(server, {
        cors: {
            origin: '*'
        }
    });

    io.on('connection', socket => {
        joinLobby(io, socket, consul, redisClient);
        disconnectLobby(io, socket, redisClient);
        generateGame(io, socket, redisClient, consul)
    });

    server.listen(8004, () => {
        console.log("Lobby Socket.IO server is running on 8004");
    });
}

module.exports = { startLobbyServer };
