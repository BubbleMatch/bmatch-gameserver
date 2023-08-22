const {verify} = require("jsonwebtoken");
const {JWTToken, getPostgresConfig} = require("../config/config");
const {fetchUserById} = require("../utils/getPostgresqlUserData");
const {v4: uuidv4} = require('uuid');
const {generateArea} = require('../gameLogic/areaGenerator')

function join(io, socket, redisClient) {
    socket.on('join', async (data) => {
        let lobbyID = data.lobbyID;
        if (lobbyID === undefined) {
            return;
        }
        socket.join(lobbyID);

        let mmr = data.mmr;
        let username = data.username;
        let type = lobbyID.startsWith(username) ? "Admin" : data.type;

        if (type !== "Bot") {
            await redisClient.hSet(`Socket:${socket.id}`, "lobbyID", lobbyID);
        }

        let lobbyData = await redisClient.hGetAll(`Lobby:${lobbyID}`);
        let players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];

        const existingPlayerIndex = players.findIndex(player => player.username === username);

        if (existingPlayerIndex > -1) {
            let oldId = players[existingPlayerIndex].id;
            io.to(oldId).emit("userExist");
            await redisClient.del(`Socket:${oldId}`);
            players[existingPlayerIndex].id = socket.id;
        } else {
            if (players.length < 4) {
                players.push({id: socket.id, mmr: mmr, username: username, type: type});
            } else {
                io.to(lobbyID).emit('playerList', await redisClient.hGetAll(`Lobby:${lobbyID}`));
                return
            }
        }

        await redisClient.hSet(`Lobby:${lobbyID}`, "Players", JSON.stringify(players));
        io.to(lobbyID).emit('playerList', await redisClient.hGetAll(`Lobby:${lobbyID}`));
    });
}

function disconnect(io, socket, redisClient) {
    socket.on('disconnect', async () => {
        try {
            const lobbyID = await redisClient.hGet(`Socket:${socket.id}`, "lobbyID");
            if (!lobbyID) return;

            const lobbyKey = `Lobby:${lobbyID}`;
            let lobbyData = await redisClient.hGetAll(lobbyKey);
            let players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];

            players = players.filter(player => player.id !== socket.id);

            const hasPlayers = players.length > 0;
            const hasNoRealPlayersOrAdmin = players.every(player => player.type !== "Player" || player.type !== "Admin");
            const hasNoAdmin = players.every(player => player.type !== "Admin");

            if (!hasPlayers || !hasNoRealPlayersOrAdmin || hasNoAdmin) {
                io.to(lobbyID).emit('lobbyRemoved');
                await redisClient.del(lobbyKey);
            } else {
                await redisClient.hSet(lobbyKey, 'Players', JSON.stringify(players));
                io.to(lobbyID).emit('playerList', await redisClient.hGetAll(lobbyKey));
            }

            await redisClient.del(`Socket:${socket.id}`);
        } catch (err) {
            console.error('Error handling disconnect:', err);
        }
    });
}

function verifyLobby(io, socket, redisClient, consul) {
    socket.on('verifyLobby', async (data) => {
        let jwt = data.JWT;

        try {
            let verifyPlayer = verify(jwt, JWTToken);
            let cfg = await getPostgresConfig(consul);
            let userFromDb = await fetchUserById(verifyPlayer.sub, cfg);

            const lobbyID = await redisClient.hGet(`Socket:${socket.id}`, "lobbyID");
            if (!lobbyID) return;
            const lobbyKey = `Lobby:${lobbyID}`;

            let lobbyData = await redisClient.hGetAll(lobbyKey);
            let playersInLobby = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];
            const gameUUID = lobbyData.UUID ? JSON.parse(lobbyData.UUID).uuid : null;

            const gameData = await redisClient.hGetAll(`Game:${gameUUID}`);
            let playersInGame = gameData && gameData.Players ? JSON.parse(gameData.Players) : [];

            const existingPlayerIndex = playersInGame.findIndex(player => player.username === userFromDb.username);

            if (existingPlayerIndex > -1) {
                return;
            }

            playersInGame.push({jwt: jwt, username: userFromDb.username, type: "Player", ready: true});

            await redisClient.hSet(`Game:${gameUUID}`, "Players", JSON.stringify(playersInGame));

            let currentReadyPlayers = JSON.parse(lobbyData.UUID).readyPlayers;
            currentReadyPlayers++;

            await redisClient.hSet(`Lobby:${lobbyID}`, 'UUID', JSON.stringify({
                ...JSON.parse(lobbyData.UUID), readyPlayers: currentReadyPlayers
            }));

            let updatedPlayersInLobby = playersInLobby.map(player => {
                if (player.username === userFromDb.username) {
                    return {...player, ready: true};
                }
                return player;
            });

            io.to(lobbyID).emit('playerList', {Players: JSON.stringify(updatedPlayersInLobby)});

            if (currentReadyPlayers === JSON.parse(lobbyData.UUID).players) {

                await redisClient.hSet(`Game:${gameUUID}`, "LobbyData", JSON.stringify({
                    players: JSON.parse(lobbyData.UUID).players, bots: JSON.parse(lobbyData.UUID).bots, ready: 0
                }));

                await redisClient.hSet(`Game:${gameUUID}`, "GameArea", JSON.stringify(generateArea()));

                await redisClient.del(lobbyKey);

                // save to cookies
                // not able to create a new lobby

                const uuidMessage = JSON.stringify({
                    message: `${gameUUID}`
                });

                io.to(lobbyID).emit("gameUUID", uuidMessage);
            }
        } catch (ex) {
            let errorData = JSON.stringify({
                message: ex.message
            });
            io.to(socket.id).emit("systemMessage", errorData);
        }
    });
}

function generateGame(io, socket, redisClient, consul) {
    socket.on('generateGame', async (data) => {
        try {
            let lobbyID = data.lobbyID;
            const lobbyKey = `Lobby:${lobbyID}`;

            let lobbyData = await redisClient.hGetAll(`Lobby:${lobbyID}`);
            let players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];

            if (players.length === 0) {
                return;
            }

            if (players.length !== 4) {
                throw new Error("In the lobby supposed to be only 4 players")
            }

            let jwt = data.JWT;

            const realPlayersAndAdmins = players.filter(player => player.type === "Player" || player.type === "Admin");

            const bots = players.filter(player => player.type === "Bot");

            let verifyPlayer = verify(jwt, JWTToken);
            let cfg = await getPostgresConfig(consul);
            let userFromDb = await fetchUserById(verifyPlayer.sub, cfg);
            const currentPlayer = players.filter(player => player.username === userFromDb.username);


            if (currentPlayer[0].type !== "Admin") {
                throw new Error("The game may be launched only by the lobby admin")
            }

            let errors = [];

            if (!userFromDb.is_account_non_expired) {
                errors.push('Account is expired');
            }

            if (!userFromDb.is_account_non_locked) {
                errors.push('Account is locked');
            }

            if (!userFromDb.is_credentials_non_expired) {
                errors.push('Credentials are expired');
            }

            if (errors.length > 0) {
                throw new Error(errors.join(', '));
            }

            const existingUUID = await redisClient.hGet(lobbyKey, 'UUID');

            if (existingUUID) {
                throw new Error("Lobby is already created");
            }

            await redisClient.hSet(lobbyKey, 'UUID', JSON.stringify({
                uuid: uuidv4(), players: realPlayersAndAdmins.length, bots: bots.length, readyPlayers: 0
            }));

            io.to(lobbyID).emit('gameRedirect');
        } catch (ex) {
            let data = JSON.stringify({
                message: ex.message
            });
            io.to(socket.id).emit("systemMessage", data);
        }
    });
}

module.exports = {join, disconnect, generateGame, verifyLobby}