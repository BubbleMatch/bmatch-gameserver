const {
    getUserJWTCache, setUserJWT_UUID_Cache, getLobbyData, incrementReadyPlayers, getGamePlayers, getCurrentGamePlayer,
    setCurrentGamePlayer, getReadyPlayers, getActionPointer, getUserFromRedisByUserId, getGameArea, setAction,
    setActionPointer, getAction
} = require("../utils/getGameData");
const {extractAndVerifyJWT, emitSystemMessage, checkLobbyProperties} = require("../utils/getLobbyData");
const {setNextPlayerId} = require("../gameLogic/queue");

// TODO: emit openBubble only for 4 person, exclude others

function joinServer(io, socket, consul, redisClient) {
    socket.on('join', async (data) => {
        if (!data.gameUUID) return;

        socket.join(data.gameUUID);
        let currentGamePlayers = await getGamePlayers(redisClient, consul, data.gameUUID);
        io.to(data.gameUUID).emit('playerList', currentGamePlayers);

        let actionPointer = await getActionPointer(redisClient, data.gameUUID);


        if (!data.token) {
            let action = await getAction(redisClient, data.gameUUID, actionPointer - 2);
            if (action !== null) {
                io.to(socket.id).emit("gameAction", action);
            }
            return;
        }

        let currentUser = await getUserJWTCache(redisClient, data.token);

        try {
            if (currentUser === null) {

                let lobbyData = await getLobbyData(redisClient, data.gameUUID);

                let userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);

                let playerFilter = lobbyData.players.filter(id => id === userFromJWT.id);
                let isGamePlayer = playerFilter.length === 1;
                if (!isGamePlayer) {
                    let action = await getAction(redisClient, data.gameUUID, actionPointer - 2);
                    if (action !== null) {
                        io.to(socket.id).emit("gameAction", action);
                    }
                    return;
                }
                let currentUserId = playerFilter[0];

                await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, currentUserId);
                await incrementReadyPlayers(redisClient, data.gameUUID);
            }

            let readyPlayers = await getReadyPlayers(redisClient, data.gameUUID);
            let lobbyProperties = checkLobbyProperties(currentGamePlayers);

            if (readyPlayers == null || readyPlayers !== lobbyProperties.realPlayersOrAdminIds.length) {
                //waiting game start
                return;
            }

            let currentGamePlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

            if (currentGamePlayer == null) {
                let nextPlayerId = setNextPlayerId(-1, currentGamePlayers);
                await setCurrentGamePlayer(redisClient, data.gameUUID, currentGamePlayers[nextPlayerId]);

                io.to(data.gameUUID).emit('currentPlayer', currentGamePlayers[nextPlayerId]);
            } else {
                io.to(data.gameUUID).emit('currentPlayer', currentGamePlayer);
            }

            let action = await getAction(redisClient, data.gameUUID, actionPointer);
            if (action !== null) {
                io.to(socket.id).emit("gameAction", action);
            }
        } catch (ex) {
            emitSystemMessage(io, socket, ex.message);
        }

    });
}


function disconnectServer(io, socket, redisClient) {
    socket.on('disconnect', async () => {

    });
}

function openedBubble(io, socket, consul, redisClient) {
    socket.on('sendOpenedBubble', async (data) => {
        try {
            if (!data.bubbleId) return;
            if (!data.token) return;
            if (!data.gameUUID) return;

            let currentUserId = await getUserJWTCache(redisClient, data.token);

            if (currentUserId === null) {

                let lobbyData = await getLobbyData(redisClient, data.gameUUID);

                let userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);

                let playerFilter = lobbyData.players.filter(id => id === userFromJWT.id);
                let isGamePlayer = playerFilter.length === 1;
                if (!isGamePlayer) {
                    // todo: return last action
                    // todo: return all open  bubbles
                    return;
                }
                currentUserId = playerFilter[0];

                await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, currentUserId);
                currentUserId = await getUserJWTCache(redisClient, data.token);
            }

            let currentUser = await getUserFromRedisByUserId(redisClient, consul, currentUserId.UserId);
            let currentGamePlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

            if (currentUser.id !== currentGamePlayer.id) return;

            let actionPointer = await getActionPointer(redisClient, data.gameUUID);


            let lastAction = await getAction(redisClient, data.gameUUID, actionPointer);

            if (lastAction && lastAction.sender.id === currentGamePlayer.id) {
                let currentGamePlayers = await getGamePlayers(redisClient, consul, data.gameUUID);
                let currentIndex = currentGamePlayers.findIndex(player => player.id === currentUser.id);

                let nextPlayerIndex = setNextPlayerId(currentIndex, currentGamePlayers);
                let nextPlayer = currentGamePlayers[nextPlayerIndex];

                await setCurrentGamePlayer(redisClient, data.gameUUID, nextPlayer);
                io.to(data.gameUUID).emit('currentPlayer', nextPlayer);
            }


            let gameArea = await getGameArea(redisClient, data.gameUUID);

            let action = {
                openBubbles: [{
                    bubbleId: data.bubbleId,
                    bubbleImg: gameArea[data.bubbleId],
                }],
                sender: currentGamePlayer,
                serverTime: new Date().toISOString()
            }

            if (lastAction && Array.isArray(lastAction.openBubbles)) {
                action.openBubbles = [...lastAction.openBubbles, ...action.openBubbles];
            }

            let incrementedActionPointer = ++actionPointer;

            await setAction(redisClient, data.gameUUID, incrementedActionPointer, action);
            await setActionPointer(redisClient, data.gameUUID, incrementedActionPointer);

            io.to(data.gameUUID).emit('openBubble', {
                bubbleId: data.bubbleId,
                bubbleImg: gameArea[data.bubbleId],
            });


            let nextPlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);
            if (nextPlayer.type === "Bot") {
                // TODO: Bot is playing
            }

        } catch (e) {
            emitSystemMessage(io, socket, e.message);
        }
    })
}

module.exports = {joinServer, disconnectServer, openedBubble}