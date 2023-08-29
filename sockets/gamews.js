const {
    getUserJWTCache,
    setUserJWT_UUID_Cache,
    getLobbyData,
    incrementReadyPlayers,
    getGamePlayers,
    getCurrentGamePlayer,
    setCurrentGamePlayer,
    getReadyPlayers,
    getActionPointer,
    getUserFromRedisByUserId,
    getGameArea,
    setAction,
    setActionPointer,
    getAction,
    setPaused,
    getPaused,
    setNextPlayer,
    setBotLastSuccessfulAttempt,
    emitOpenBubbles,
    emitCloseBubbles
} = require("../utils/getGameData");
const {extractAndVerifyJWT, emitSystemMessage, checkLobbyProperties} = require("../utils/getLobbyData");
const {setNextPlayerId} = require("../gameLogic/queue");
const {chooseCell} = require("../gameLogic/pseudoRandomBotLogic");

// TODO: emit openBubble only for 4 person, exclude others

async function handleUserAuthentication(data, socket, redisClient, consul) {
    let currentUser = await getUserJWTCache(redisClient, data.token);
    if (currentUser === null) {
        const lobbyData = await getLobbyData(redisClient, data.gameUUID);
        const userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);
        const isGamePlayer = lobbyData.players.includes(userFromJWT.id);
        if (!isGamePlayer) return null;

        await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, userFromJWT.id);
        await incrementReadyPlayers(redisClient, data.gameUUID);
        return userFromJWT.id;
    }
    return currentUser;
}

function joinServer(io, socket, consul, redisClient) {
    socket.on('join', async (data) => {
        if (!data.gameUUID) return;

        socket.join(data.gameUUID);
        const currentGamePlayers = await getGamePlayers(redisClient, consul, data.gameUUID);
        io.to(data.gameUUID).emit('playerList', currentGamePlayers);

        if (!data.token) {
            const actionPointer = getActionPointer(redisClient, data.gameUUID)
            const action = await getAction(redisClient, data.gameUUID, actionPointer);
            if (action) io.to(socket.id).emit("gameAction", action);
            return;
        }

        try {
            const currentUserId = await handleUserAuthentication(data, socket, redisClient, consul);

            if (!currentUserId) {
                const action = await getAction(redisClient, data.gameUUID);
                if (action) io.to(socket.id).emit("gameAction", action);
                return;
            }

            const readyPlayers = await getReadyPlayers(redisClient, data.gameUUID);
            const lobbyProperties = checkLobbyProperties(currentGamePlayers);
            if (readyPlayers == null || readyPlayers !== lobbyProperties.realPlayersOrAdminIds.length) return;

            await setPaused(redisClient, data.gameUUID, 'false');

            let currentGamePlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

            if (!currentGamePlayer) {
                await setCurrentGamePlayer(redisClient, data.gameUUID, currentGamePlayers[0])
                currentGamePlayer = currentGamePlayers[0];
            }

            io.to(data.gameUUID).emit('currentPlayer', currentGamePlayer);

            const action = await getAction(redisClient, data.gameUUID, await getActionPointer(redisClient, data.gameUUID));
            if (action) io.to(socket.id).emit("gameAction", action);

            await performBotActions(io, redisClient, consul, data);
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

            let isPaused = await getPaused(redisClient, data.gameUUID);

            if (isPaused) return;

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

            if (currentGamePlayer.actionPoints === undefined) {
                currentGamePlayer.actionPoints = 2;
            }

            if (currentGamePlayer.actionPoints === 0) {

                let nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, currentUserId);
                io.to(data.gameUUID).emit('currentPlayer', nextPlayer);

                console.log("No action gamePoints");

                return
            }

            let actionPointer = await getActionPointer(redisClient, data.gameUUID);

            let lastAction = await getAction(redisClient, data.gameUUID, actionPointer);

            let gameArea = await getGameArea(redisClient, data.gameUUID);

            let action = {
                openBubbles: [], requestedBubbles: {
                    bubbleId: Number(data.bubbleId), bubbleImg: Number(gameArea[data.bubbleId]),
                }, sender: currentGamePlayer, serverTime: new Date().toISOString()
            }

            let incrementedActionPointer = ++actionPointer;
            await setActionPointer(redisClient, data.gameUUID, incrementedActionPointer);

            // update ActionPoints
            --currentGamePlayer.actionPoints;
            await setCurrentGamePlayer(redisClient, data.gameUUID, currentGamePlayer);

            await emitOpenBubbles(io, data.gameUUID, Number(data.bubbleId), Number(gameArea[Number(data.bubbleId)]))

            if (lastAction && lastAction.requestedBubbles) {
                action.openBubbles = [...action.openBubbles, ...lastAction.openBubbles];
            }

            if (lastAction && lastAction.requestedBubbles && currentGamePlayer.actionPoints === 0) {
                if ((lastAction.requestedBubbles.bubbleImg !== action.requestedBubbles.bubbleImg)) {

                    let nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, currentUserId);
                    io.to(data.gameUUID).emit('currentPlayer', nextPlayer);

                    setTimeout(async () => {
                        await emitCloseBubbles(io, data.gameUUID, Number(lastAction.requestedBubbles.bubbleId), Number(action.requestedBubbles.bubbleId));
                        await setPaused(redisClient, data.gameUUID, 'false');
                    }, 2000);

                } else {
                    // update ActionPoints
                    currentGamePlayer.actionPoints = 2;
                    await setCurrentGamePlayer(redisClient, data.gameUUID, currentGamePlayer);
                    action.openBubbles = [...action.openBubbles, lastAction.requestedBubbles, action.requestedBubbles];
                }
            }

            await setAction(redisClient, data.gameUUID, incrementedActionPointer, action);
            await setActionPointer(redisClient, data.gameUUID, incrementedActionPointer);

            let nextPlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

            if (nextPlayer.type === "Bot") {
                await setPaused(redisClient, data.gameUUID, 'true');
                await performBotActions(io, redisClient, consul, data);
                await setPaused(redisClient, data.gameUUID, 'false');
            }

            let veryLastActionPointer = await getActionPointer(redisClient, data.gameUUID);
            let veryLastAction = await getAction(redisClient, data.gameUUID, veryLastActionPointer);

            if (veryLastAction.openBubbles.length === 100) {
                await setPaused(redisClient, data.gameUUID, 'true');

                // TODO:  send to kafka game data
            }

        } catch (e) {
            emitSystemMessage(io, socket, e.message);
        }
    })
}

async function performBotActions(io, redisClient, consul, data) {
    let nextPlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

    while (nextPlayer.type === "Bot") {
        let botAp = await getActionPointer(redisClient, data.gameUUID);
        let chCellBotAction = await getAction(redisClient, data.gameUUID, botAp);

        // if (chCellBotAction.openBubbles.length === 100) {
        //     console.log(chCellBotAction.openBubbles.length);
        //     return;
        // }

        let nextTry = false;

        await sleep(200);

        let gameArea = await getGameArea(redisClient, data.gameUUID);

        const [botSelect1, newLastSuccessfulAttempt1] = chooseCell(chCellBotAction.openBubbles, gameArea, nextPlayer.lastSuccessfulAttempt);
        const [botSelect2, newLastSuccessfulAttempt2] = chooseCell(chCellBotAction.openBubbles, gameArea, newLastSuccessfulAttempt1, gameArea[Number(botSelect1)], botSelect1);

        await sleep(150);
        await emitOpenBubbles(io, data.gameUUID, Number(botSelect1), Number(gameArea[Number(botSelect1)]));

        await sleep(200);
        await emitOpenBubbles(io, data.gameUUID, Number(botSelect2), Number(gameArea[Number(botSelect2)]));

        await setBotLastSuccessfulAttempt(redisClient, data.gameUUID, nextPlayer.id, newLastSuccessfulAttempt2);

        let botActionPointer = await getActionPointer(redisClient, data.gameUUID);

        let botLastAction = await getAction(redisClient, data.gameUUID, botActionPointer);
        let previousOpenBubbles = botLastAction ? botLastAction.openBubbles : [];

        let incrementedBotActionPointer = ++botActionPointer;
        await setActionPointer(redisClient, data.gameUUID, incrementedBotActionPointer);

        let botAction = {
            openBubbles: [...previousOpenBubbles],
            requestedBubbles: [
                {
                    bubbleId: Number(botSelect1), bubbleImg: Number(gameArea[Number(botSelect1)])
                },
                {
                    bubbleId: Number(botSelect2), bubbleImg: Number(gameArea[Number(botSelect2)])
                }
            ], sender: nextPlayer, serverTime: new Date().toISOString()
        }

        if (gameArea[botSelect1] !== gameArea[botSelect2]) {
            await sleep(2000);
            await emitCloseBubbles(io, data.gameUUID, Number(botSelect1), Number(botSelect2))
        } else {
            botAction.openBubbles.push(
                {bubbleId: botSelect1, bubbleImg: gameArea[botSelect1]},
                {bubbleId: botSelect2, bubbleImg: gameArea[botSelect2]}
            );
            console.log(`opened: ${botAction.openBubbles.length}`);

            nextTry = true;
        }

        await setAction(redisClient, data.gameUUID, incrementedBotActionPointer, botAction);

        await sleep(200);

        if (!nextTry) {
            nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, nextPlayer);
            io.to(data.gameUUID).emit('currentPlayer', nextPlayer);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {joinServer, disconnectServer, openedBubble}