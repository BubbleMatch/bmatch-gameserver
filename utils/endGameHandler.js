const {setPaused, cancelTimer, getGameJWTFromRedis} = require("./getGameData");
const {getPostgresConfig} = require("../config/config");
const {extractAndVerifyJWT} = require("./getLobbyData");
const {setStatusById} = require("./getPostgresqlUserData");

async function endGame(io, redisClient, rabbitMQChannel, consul, gameUUID) {
    await setPaused(redisClient, gameUUID, 'true');
    io.to(gameUUID).emit('gameOver');
    await cancelTimer(redisClient, rabbitMQChannel, gameUUID);

    let userJWTs = await getGameJWTFromRedis(redisClient, gameUUID);
    let cfg = await getPostgresConfig();
    for (const userJWT in userJWTs) {
        let currentUser = await extractAndVerifyJWT(userJWT, consul, redisClient);
        await setStatusById(currentUser.id, "REGISTERED", cfg);
    }
}

module.exports = {
    endGame
}