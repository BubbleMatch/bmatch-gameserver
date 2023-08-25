const {
    getUserJWTCache, setUserJWT_UUID_Cache, getLobbyData, incrementReadyPlayers, getGamePlayers, getCurrentGamePlayer
} = require("../utils/getGameData");
const {extractAndVerifyJWT, emitSystemMessage, checkLobbyProperties} = require("../utils/getLobbyData");

function joinServer(io, socket, consul, redisClient) {
    socket.on('join', async (data) => {
        if (!data.gameUUID) return;

        socket.join(data.gameUUID);
        let currentGamePlayers = await getGamePlayers(io, redisClient, consul, data.gameUUID);
        io.to(data.gameUUID).emit('playerList', currentGamePlayers);

        if (!data.token) return;

        let currentUser = await getUserJWTCache(redisClient, data.token);

        try {
            if (currentUser === null) {

                let lobbyData = await getLobbyData(redisClient, data.gameUUID);

                let userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);

                let playerFilter = lobbyData.players.filter(id => id === userFromJWT.id);
                let isGamePlayer = playerFilter.length === 1;
                if (!isGamePlayer) {
                    // todo: return last action
                    // todo: return all open  bubbles
                    return;
                }
                let currentUserId = playerFilter[0];

                await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, currentUserId);
                await incrementReadyPlayers(redisClient, data.gameUUID);
            }

            // set currentPlayerID
            let currentGamePlayerId = await getCurrentGamePlayer(redisClient, data.gameUUID);


            console.log(currentGamePlayerId);
        } catch (ex) {
            emitSystemMessage(io, socket, ex.message);
        }

    });
}


function disconnectServer(io, socket, redisClient) {
    socket.on('disconnect', async () => {

    });
}

module.exports = {joinServer, disconnectServer}