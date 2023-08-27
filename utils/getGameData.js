const {getPostgresConfig} = require("../config/config");
const {fetchUserById} = require("./getPostgresqlUserData");
const consul = require("consul");
const {setNextPlayerId} = require("../gameLogic/queue");

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

async function getGamePlayers(redisClient, consul, gameUUID) {
    let gameData = await getLobbyData(redisClient, gameUUID)
    let gamePlayers = [];

    // todo: fix exception of null
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

    if (typeof lobbyData.readyPlayers === 'number' && lobbyData.readyPlayers < lobbyData.players.length) {
        lobbyData.readyPlayers++;
    }

    await redisClient.hSet(`Game:${uuid}`, "LobbyData", JSON.stringify(lobbyData));

    return lobbyData;
}

async function getReadyPlayers(redisClient, uuid) {
    const lobbyDataRaw = await redisClient.hGet(`Game:${uuid}`, "LobbyData");
    if (!lobbyDataRaw) return null;

    const lobbyData = JSON.parse(lobbyDataRaw);

    return lobbyData.readyPlayers;
}


async function getCurrentGamePlayer(redisClient, uuid) {
    const currentPlayerRaw = await redisClient.hGet(`Game:${uuid}`, "CurrentPlayer");

    if (!currentPlayerRaw) return null;
    return JSON.parse(currentPlayerRaw);
}

async function setCurrentGamePlayer(redisClient, uuid, currentPlayer) {
    await redisClient.hSet(`Game:${uuid}`, "CurrentPlayer", JSON.stringify(currentPlayer));
}

async function getActionPointer(redisClient, uuid) {
    const actionPointerRaw = await redisClient.hGet(`Game:${uuid}`, `LastActionId`,);

    if (!actionPointerRaw) return null;
    return JSON.parse(actionPointerRaw);
}

async function setActionPointer(redisClient, uuid, actionPointerId) {
    await redisClient.hSet(`Game:${uuid}`, `LastActionId`, actionPointerId);
}

async function setAction(redisClient, uuid, actionId, action) {
    await redisClient.hSet(`Game:${uuid}`, `Action:${actionId}`, JSON.stringify(action));
}

async function getAction(redisClient, uuid, actionId) {
    const lastActionDataRaw = await redisClient.hGet(`Game:${uuid}`, `Action:${actionId}`);

    if (!lastActionDataRaw) return null;
    return JSON.parse(lastActionDataRaw);
}

async function getGameArea(redisClient, uuid) {
    const gameArea = await redisClient.hGet(`Game:${uuid}`, `GameArea`);

    if (!gameArea) return null;
    return JSON.parse(gameArea);
}

async function getPaused(redisClient, uuid){
    let isPausedRaw = await redisClient.hGet(`Game:${uuid}`, `GamePaused`);
    return isPausedRaw === 'true';
}

async function setPaused(redisClient, uuid, flag){
    await redisClient.hSet(`Game:${uuid}`, `GamePaused`, flag);
}


async function setNextPlayer(redisClient, consul, gameUUID, currentUserId){
    let currentGamePlayers = await getGamePlayers(redisClient, consul, gameUUID);
    let currentIndex = currentGamePlayers.findIndex(player => player.id === currentUserId);

    let nextPlayerIndex = setNextPlayerId(currentIndex, currentGamePlayers);
    let nextPlayer = currentGamePlayers[nextPlayerIndex];

    await setPaused(redisClient, gameUUID, 'true');

    await setCurrentGamePlayer(redisClient, gameUUID, nextPlayer);



    return nextPlayer;
}

module.exports = {
    getGamePlayers,
    setUserJWT_UUID_Cache,
    getUserJWTCache,
    getLobbyData,
    incrementReadyPlayers,
    getCurrentGamePlayer,
    setCurrentGamePlayer,
    getReadyPlayers,
    setAction,
    getAction,
    getActionPointer,
    getUserFromRedisByUserId,
    setActionPointer,
    getGameArea,
    getPaused,
    setPaused,
    setNextPlayer
}