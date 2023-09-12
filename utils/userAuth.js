const {
    getUserJWTCache,
    linkUserWithWebSocket,
    getLobbyData,
    setUserJWT_UUID_Cache,
    updateUsersWSAtLobbyData,
    addGameWebSocketsToRedis,
    addGameJWTsToRedis, addGameWebSocketsGuestsToRedis, incrementReadyPlayers
} = require("./getGameData");
const {extractAndVerifyJWT} = require("./getLobbyData");

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

module.exports = {
    handleUserAuthentication
}