const {getPostgresConfig} = require("../config/config");
const {fetchUserById} = require("./getPostgresqlUserData");
const consul = require("consul");

const getUserFromRedisByUserId = async (redisClient, consul, userId) => {

    const userProfileKey = `user_profile:${userId}`;

    let userProfile = await redisClient.get(userProfileKey);

    if (userProfile) {
        userProfile = JSON.parse(userProfile);
    } else {
        const cfg = await getPostgresConfig(consul);
        userProfile = await fetchUserById(userId, cfg);

        await redisClient.set(userProfileKey, JSON.stringify(userProfile), 'EX', 3600);
    }

    return userProfile;
};

async function getGamePlayers(io, redisClient, consul, gameUUID) {
    let gameData = await getLobbyData(redisClient, gameUUID)
    let gamePlayers = [];

    for (let id of gameData.players) {
        let userFromRedisByUserId = await getUserFromRedisByUserId(redisClient, consul, id);

        const {
            id: userId, username, mmr,
        } = userFromRedisByUserId;

        const transformedUser = {id: userId, username, mmr, type: "Player"};
        gamePlayers.push(transformedUser);
    }

    gameData.bots.forEach(bot => {
        gamePlayers.push(bot);
    });

    return gamePlayers;
}

async function getLobbyData(redisClient, gameUUID) {
    let redisData = await redisClient.hGet(`Game:${gameUUID}`, 'LobbyData');
    return JSON.parse(redisData)
}

async function setUserJWT_UUID_Cache(redisClient, JWTToken, UUID, socketId, userId) {
    await redisClient.hSet(`GameJWT:${JWTToken}`, "UUID", UUID);
    await redisClient.hSet(`GameJWT:${JWTToken}`, "Socket", socketId);
    await redisClient.hSet(`GameJWT:${JWTToken}`, "UserId", userId);
    await redisClient.expire(`GameJWT:${JWTToken}`, 7200);
}

async function getUserJWTCache(redisClient, JWTToken) {
    const gameJWT = await redisClient.hGetAll(`GameJWT:${JWTToken}`);
    if (Object.keys(gameJWT).length === 0) return null;

    return gameJWT;
}

async function incrementReadyPlayers(redisClient, uuid) {
    const lobbyDataRaw = await redisClient.hGet(`Game:${uuid}`, "LobbyData");
    if (!lobbyDataRaw) return null;

    const lobbyData = JSON.parse(lobbyDataRaw);

    if (typeof lobbyData.readyPlayers === 'number' && lobbyData.players.length < lobbyData.readyPlayers) {
        lobbyData.readyPlayers++;
    }

    await redisClient.hSet(`Game:${uuid}`, "LobbyData", JSON.stringify(lobbyData));

    return lobbyData;
}

async function getCurrentGamePlayer(redisClient, uuid) {
    const currentPlayerRaw = await redisClient.hGet(`Game:${uuid}`, "CurrentPlayer");

    if (!currentPlayerRaw) return null;
    return JSON.parse(currentPlayerRaw);
}

async function setCurrentGamePlayer(redisClient, uuid, currentPlayer) {
    await redisClient.hSet(`Game:${uuid}`, "CurrentPlayer", JSON.stringify(currentPlayer));
}


module.exports = {
    getGamePlayers,
    setUserJWT_UUID_Cache,
    getUserJWTCache,
    getLobbyData,
    incrementReadyPlayers,
    getCurrentGamePlayer,
    setCurrentGamePlayer
}
