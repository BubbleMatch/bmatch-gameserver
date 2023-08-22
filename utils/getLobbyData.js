const {getPostgresConfig} = require("../config/config");
const {fetchUserById} = require("./getPostgresqlUserData");
const {verify} = require("jsonwebtoken");

async function extractAndVerifyJWT(jwt, JWTToken, consul) {
    const verifyPlayer = verify(jwt, JWTToken);
    const cfg = await getPostgresConfig(consul);
    return await fetchUserById(verifyPlayer.sub, cfg);
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
    io.to(socket.id).emit("systemMessage", data);
}


module.exports = {
    extractAndVerifyJWT,
    fetchLobbyDataAndPlayers,
    emitPlayerListToLobby,
    emitSystemMessage
}