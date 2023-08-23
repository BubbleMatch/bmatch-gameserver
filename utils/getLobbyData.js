const {getPostgresConfig, JWTToken} = require("../config/config");
const {fetchUserById} = require("./getPostgresqlUserData");
const {verify} = require("jsonwebtoken");

async function extractAndVerifyJWT(jwt, consul, redisClient) {
    const verifyPlayer = verify(jwt, JWTToken);
    const userId = verifyPlayer.sub;

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
}


async function fetchLobbyDataAndPlayers(redisClient, lobbyID) {
    const lobbyData = await redisClient.hGetAll(`Lobby:${lobbyID}`);
    const players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];
    return { lobbyData, players };
}


async function emitPlayerListToLobby(io, redisClient, lobbyID) {
    io.to(lobbyID).emit('playerList', await redisClient.hGetAll(`Lobby:${lobbyID}`));
}


function emitSystemMessage(io, socket, message) {
    const data = JSON.stringify({ message });
    console.log(data);
    io.to(socket.id).emit("systemMessage", data);
}


module.exports = {
    extractAndVerifyJWT,
    fetchLobbyDataAndPlayers,
    emitPlayerListToLobby,
    emitSystemMessage
}