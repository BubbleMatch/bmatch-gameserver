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
    emitCloseBubbles,
    addGameJWTsToRedis,
    addGameWebSocketsToRedis,
    getGameWebSocketsFromRedis,
    addGameWebSocketsGuestsToRedis,
    linkUserWithWebSocket,
    getGameUUIDByGameWS,
    getGameWebSocketsGuestsFromRedis,
    updateUsersWSAtLobbyData,
    getTimerTTL,
    setTimer, getUserPaused, setUserPaused,
} = require("../utils/getGameData");
const {
    extractAndVerifyJWT, emitSystemMessage, checkLobbyProperties,
} = require("../utils/getLobbyData");
const {chooseCell} = require("../gameLogic/pseudoRandomBotLogic");

async function handleUserAuthentication(io, data, socket, redisClient, consul) {
    const currentUser = await getUserJWTCache(redisClient, data.token);

    // all users ws
    await linkUserWithWebSocket(redisClient, data.gameUUID, socket.id);

    if (!currentUser) {
        return await authenticateNewUser(io, data, socket, redisClient, consul);
    }

    if (currentUser.UUID !== data.gameUUID) {
        io.to(socket.id).emit("userAlreadyInGame", data.gameUUID);
        return false;
    }

    const userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);
    const lobbyData = await getLobbyData(redisClient, data.gameUUID);
    const isGamePlayer = lobbyData.players.includes(userFromJWT.id);

    if (!isGamePlayer) {
        return false;
    }

    await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, userFromJWT.id);
    await updateUsersWSAtLobbyData(redisClient, lobbyData, userFromJWT, socket.id, data.gameUUID);
    await addGameWebSocketsToRedis(redisClient, data.gameUUID, socket.id);
    await addGameJWTsToRedis(redisClient, data.gameUUID, data.token);

    return currentUser;
}

async function authenticateNewUser(io, data, socket, redisClient, consul) {
    let lobbyData = await getLobbyData(redisClient, data.gameUUID);
    const userFromJWT = await extractAndVerifyJWT(data.token, consul, redisClient);

    if (!lobbyData.players.includes(userFromJWT.id)) {
        //only guests ws
        await addGameWebSocketsGuestsToRedis(redisClient, data.gameUUID, socket.id);
        return false
    }

    await setUserJWT_UUID_Cache(redisClient, data.token, data.gameUUID, socket.id, userFromJWT.id);
    await incrementReadyPlayers(redisClient, data.gameUUID);

    lobbyData = await getLobbyData(redisClient, data.gameUUID);

    //add players ws
    await addGameWebSocketsToRedis(redisClient, data.gameUUID, socket.id)

    await updateUsersWSAtLobbyData(redisClient, lobbyData, userFromJWT, socket.id, data.gameUUID);

    return userFromJWT.id;
}

function joinServer(io, socket, consul, redisClient) {
    socket.on('join', async (data) => {
        try {
            if (!data.gameUUID) return;

            socket.join(data.gameUUID);
            const currentGamePlayers = await getGamePlayers(redisClient, consul, data.gameUUID);
            io.to(data.gameUUID).emit('playerList', currentGamePlayers);

            if (!data.token) {
                const actionPointer = getActionPointer(redisClient, data.gameUUID)
                const action = await getAction(redisClient, data.gameUUID, actionPointer - 2);
                console.log(action);
                if (action) io.to(socket.id).emit("gameAction", action);
                return;
            }

            const currentUserId = await handleUserAuthentication(io, data, socket, redisClient, consul);

            if (!currentUserId) {
                // Guest handler
                const actionPointer = getActionPointer(redisClient, data.gameUUID)
                const action = await getAction(redisClient, data.gameUUID, actionPointer - 2);
                console.log(action);
                if (action) io.to(socket.id).emit("gameAction", action);
                return;
            }

            const readyPlayers = await getReadyPlayers(redisClient, data.gameUUID);
            const lobbyProperties = checkLobbyProperties(currentGamePlayers);
            if (readyPlayers == null || readyPlayers !== lobbyProperties.realPlayersOrAdminIds.length) return;

            await setPaused(redisClient, data.gameUUID, 'false');

            let currentGamePlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);
            let timerTTL = await getTimerTTL(redisClient, data.gameUUID)

            if (!currentGamePlayer) {
                await setCurrentGamePlayer(redisClient, data.gameUUID, currentGamePlayers[0])
                currentGamePlayer = currentGamePlayers[0];

                if (timerTTL === -1 || timerTTL === -2) {
                    let timer = await setTimer(redisClient, 30, data.gameUUID);
                    io.to(data.gameUUID).emit('timeRequested', timer);
                }
            }

            io.to(data.gameUUID).emit('currentPlayer', currentGamePlayer);
            timerTTL = await getTimerTTL(redisClient, data.gameUUID);

            io.to(data.gameUUID).emit('timeRequested', timerTTL);

            const action = await getAction(redisClient, data.gameUUID, await getActionPointer(redisClient, data.gameUUID));
            if (action) io.to(socket.id).emit("gameAction", action);

            await performBotActions(io, redisClient, consul, data);
        } catch (ex) {
            console.log(ex);
            emitSystemMessage(io, socket, ex.message);
        }
    });
}

function disconnectServer(io, socket, redisClient, consul) {
    socket.on('disconnect', async () => {

        try {
            let currentGameUUID = await getGameUUIDByGameWS(redisClient, socket.id);

            if (currentGameUUID == null) {
                throw new Error("Not able to parse lobby-id");
            }

            await redisClient.del(`GameWS:${socket.id}`);

            let lobbyData = await getLobbyData(redisClient, currentGameUUID);

            let userLeftId = lobbyData.userWS.filter(s => s.ws === socket.id).map(u => u.id);

            if (!userLeftId) {
                // todo :idk map again ws
                return;
            }

            let leftUser = await getUserFromRedisByUserId(redisClient, consul, userLeftId);


        } catch (e) {
            emitSystemMessage(io, socket, e.message);
        }
    });
}

function initExpirationSubscriber(redisClient) {
    (async () => {
        const subscriber = redisClient.duplicate();

        await subscriber.connect();

        await subscriber.subscribe('__keyevent@0__:expired', (message) => {
            const gameUUIDPattern = /Game:(.*?):Timer/;
            const match = message.match(gameUUIDPattern);

            if (match && match[1]) {
                const gameUUID = match[1];
                console.log(gameUUID);
            }
        });
    })();
}


function openedBubble(io, socket, consul, redisClient) {
    socket.on('sendOpenedBubble', async (data) => {
        try {
            if (!data.bubbleId || !data.token || !data.gameUUID) return;

            const isPaused = await getPaused(redisClient, data.gameUUID);
            if (isPaused) return;

            const userAuth = await handleUserAuthentication(io, data, socket, redisClient, consul);
            if (!userAuth) return;

            const currentUser = await getUserFromRedisByUserId(redisClient, consul, userAuth.UserId);
            let currentGamePlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

            if (currentUser.id !== currentGamePlayer.id) return;

            if (currentGamePlayer.actionPoints === undefined) {
                currentGamePlayer.actionPoints = 2;
            }

            if (currentGamePlayer.actionPoints === 0) {
                let nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, userAuth);
                io.to(data.gameUUID).emit('currentPlayer', nextPlayer);
                return;
            }

            await setPaused(redisClient, data.gameUUID, 'true');

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

                    let nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, userAuth);
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


            let playersWS = await getGameWebSocketsFromRedis(redisClient, data.gameUUID);

            //todo : fix
            //todo: add audit
            //todo: add timer


         //   let timerTTL = await getTimerTTL()

            for (const userSocketId of playersWS) {
                //     io.to(userSocketId).emit('setTimer', {gett});
            }

            await setAction(redisClient, data.gameUUID, incrementedActionPointer, action);
            await setActionPointer(redisClient, data.gameUUID, incrementedActionPointer);

            await setPaused(redisClient, data.gameUUID, 'false');

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
                io.to(data.gameUUID).emit('gameOver');
                // TODO:  send to kafka game data
                // TODO:  REMOVE JWTS UUID
            }

        } catch (e) {
            emitSystemMessage(io, socket, e.message);
        }
    })
}

function chatMessage(io, socket, consul, redisClient) {
    socket.on("chatMessage", async (data) => {
        try {
            if (data.message.length < 1) return;
            if (!data.gameUUID) return;

            let userAuth = await handleUserAuthentication(io, data, socket, redisClient, consul);

            let userSockets = await getGameWebSocketsFromRedis(redisClient, data.gameUUID);

            if (!userSockets.includes(socket.id)) {
                io.to(socket.id).emit('receiveMessage', {message: "nobody hears you ;(", username: "System"});
                return;
            }

            for (const userSocketId of userSockets) {
                io.to(userSocketId).emit('receiveMessage', {message: data.message, username: data.username});
            }

        } catch (e) {
            emitSystemMessage(io, socket, e.message);
        }
    });
}

async function performBotActions(io, redisClient, consul, data) {
    let nextPlayer = await getCurrentGamePlayer(redisClient, data.gameUUID);

    while (nextPlayer.type === "Bot") {
        let botAp = await getActionPointer(redisClient, data.gameUUID);
        let chCellBotAction = await getAction(redisClient, data.gameUUID, botAp);

        if (chCellBotAction.openBubbles.length === 100) {
            console.log(chCellBotAction.openBubbles.length);
            return;
        }

        let nextTry = false;

        await randomSleep(1000, 2000);

        let gameArea = await getGameArea(redisClient, data.gameUUID);

        const [botSelect1, newLastSuccessfulAttempt1] = chooseCell(chCellBotAction.openBubbles, gameArea, nextPlayer.lastSuccessfulAttempt);
        const [botSelect2, newLastSuccessfulAttempt2] = chooseCell(chCellBotAction.openBubbles, gameArea, newLastSuccessfulAttempt1, gameArea[Number(botSelect1)], botSelect1);

        await randomSleep(200, 1000);
        await emitOpenBubbles(io, data.gameUUID, Number(botSelect1), Number(gameArea[Number(botSelect1)]));

        await randomSleep(200, 1000);
        await emitOpenBubbles(io, data.gameUUID, Number(botSelect2), Number(gameArea[Number(botSelect2)]));

        await setBotLastSuccessfulAttempt(redisClient, data.gameUUID, nextPlayer.id, newLastSuccessfulAttempt2);

        let botActionPointer = await getActionPointer(redisClient, data.gameUUID);

        let botLastAction = await getAction(redisClient, data.gameUUID, botActionPointer);

        if (botLastAction && botLastAction.openBubbles.length === 100) {
            await setPaused(redisClient, data.gameUUID, 'true');
            io.to(data.gameUUID).emit('gameOver');
            return;
        }

        let previousOpenBubbles = botLastAction ? botLastAction.openBubbles : [];

        let incrementedBotActionPointer = ++botActionPointer;
        await setActionPointer(redisClient, data.gameUUID, incrementedBotActionPointer);

        let botAction = {
            openBubbles: [...previousOpenBubbles], requestedBubbles: [{
                bubbleId: Number(botSelect1), bubbleImg: Number(gameArea[Number(botSelect1)])
            }, {
                bubbleId: Number(botSelect2), bubbleImg: Number(gameArea[Number(botSelect2)])
            }], sender: nextPlayer, serverTime: new Date().toISOString()
        }

        if (gameArea[botSelect1] !== gameArea[botSelect2]) {
            await randomSleep(1000, 2000);

            await emitCloseBubbles(io, data.gameUUID, Number(botSelect1), Number(botSelect2))
        } else {
            botAction.openBubbles.push({bubbleId: botSelect1, bubbleImg: gameArea[botSelect1]}, {
                bubbleId: botSelect2, bubbleImg: gameArea[botSelect2]
            });

            nextTry = true;
        }

        await setAction(redisClient, data.gameUUID, incrementedBotActionPointer, botAction);

        await randomSleep(1000, 2500);

        if (!nextTry) {
            nextPlayer = await setNextPlayer(redisClient, consul, data.gameUUID, nextPlayer);
            io.to(data.gameUUID).emit('currentPlayer', nextPlayer);
        }
    }
}


function ping(socket, io) {
    socket.on("ping", () => {
        io.to(socket.id).emit("pong");
    });
}

function userPause(io, socket, consul, redisClient) {
    socket.on('userPause', async (data) => {
        if (!data.gameUUID) return;

        try {
            let userAuth = await handleUserAuthentication(io, data, socket, redisClient, consul);

            let userPausedData = await getUserPaused(redisClient, data.gameUUID);
            let isPaused = userPausedData.paused;

            if(!isPaused) {
                let pausedTime = new Date(userPausedData.time);
                let currentTime = new Date();
                let timeDifference = (currentTime - pausedTime) / 1000;
                
                if(timeDifference < 5  * 60) {
                    let remainingTime = 5 * 60 - timeDifference;

                    let minutesLeft = Math.floor(remainingTime / 60);
                    let secondsLeft = Math.floor(remainingTime % 60);

                    let timeLeftFormatted = `${String(minutesLeft).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;

                    io.to(socket.id).emit('receiveMessage', {message: `Cannot pause again within 5 minutes. Wait for ${timeLeftFormatted} more.`, username: "System"});

                    return;
                }

            }

            isPaused = !isPaused;
            let userPaused = isPaused ? "true" : "false";

            await setUserPaused(redisClient, data.gameUUID, userPaused);
            io.to(data.gameUUID).emit('isPaused', {
                time: new Date().toISOString(),
                paused: userPaused
            });
        } catch (e) {

        }
    });
}

function randomSleep(min, max) {
    return new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));
}

module.exports = {joinServer, disconnectServer, openedBubble, chatMessage, ping, initExpirationSubscriber, userPause}