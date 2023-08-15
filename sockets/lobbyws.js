function join(io, socket, redisClient) {
    socket.on('join', async (data) => {
        let lobbyID = data.lobbyID;
        socket.join(lobbyID);

        let mmr = data.mmr;
        let username = data.username;
        let type = data.type;

        await redisClient.hSet(`Socket:${socket.id}`, "lobbyID", lobbyID);

        let lobbyData = await redisClient.hGetAll(`Lobby:${lobbyID}`);
        let players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];

        const existingPlayerIndex = players.findIndex(player => player.username === username);

        if (existingPlayerIndex > -1) {
            players[existingPlayerIndex].id = socket.id;
        } else {
            players.push({ id: socket.id, mmr: mmr, username: username, type: type });
        }

        await redisClient.hSet(`Lobby:${lobbyID}`, "Players", JSON.stringify(players));
        io.to(lobbyID).emit('playerList', await redisClient.hGetAll(`Lobby:${lobbyID}`));
    });
}

function disconnect(io, socket, redisClient) {
    socket.on('disconnect', async () => {

        const lobbyID = await redisClient.hGet(`Socket:${socket.id}`, "lobbyID");

        if (lobbyID) {
            const lobbyKey = `Lobby:${lobbyID}`;

            try {
                let lobbyData = await redisClient.hGetAll(lobbyKey);
                let players = lobbyData && lobbyData.Players ? JSON.parse(lobbyData.Players) : [];

                players = players.filter(player => player.id !== socket.id);

                if (players.length === 0) {
                    await redisClient.del(lobbyKey);
                } else {
                    await redisClient.hSet(lobbyKey, 'Players', JSON.stringify(players));
                    io.to(lobbyID).emit('playerList', await redisClient.hGetAll(lobbyKey));
                }

                await redisClient.del(`Socket:${socket.id}`);
            } catch (err) {
                console.error('Error handling disconnect:', err);
            }
        }
    });
}

module.exports = {join, disconnect}