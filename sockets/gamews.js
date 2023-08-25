const {
    fetchLobbyDataAndPlayers,
    getLobbyUUID,
    setUserSocket,
    checkLobbyProperties,
    setLobbyPlayersData,
    emitPlayerListToLobby,
    extractAndVerifyJWT,
    emitSystemMessage
} = require("../utils/getLobbyData");

function joinServer(io, socket, consul, redisClient) {
    socket.on('join', async (data) => {
        console.log(1);
    });
}


function disconnectServer(io, socket, redisClient) {
    socket.on('disconnect', async () => {

    });
}

module.exports = {joinServer, disconnectServer}