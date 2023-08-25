function mod(n, m) {
    return ((n % m) + m) % m;
}

function setNextPlayerId(playerId, currentGamePlayers) {
    return mod(playerId+1, currentGamePlayers.length);
}

module.exports = {
    setNextPlayerId
}