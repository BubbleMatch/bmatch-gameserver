function join(io, socket, redisClient) {
    socket.on('join', async (data) => {
        let lobbyID = data.lobbyID;
        if (lobbyID === undefined) {
            return;
        }
        socket.join(lobbyID);

        let mmr = data.mmr;
        let username = data.username;
        let type =  lobbyID.startsWith(username) ? "Admin" : data.type;

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
            players.push({id: socket.id, mmr: mmr, username: username, type: type});
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
                io.to(lobbyID).emit('lobbyRemoved', await redisClient.hGetAll(lobbyKey));
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

module.exports = {join, disconnect}