const express = require('express');
const redis = require('redis');
const cors = require("cors");
const Consul = require('consul');
const fs = require('fs');
const path = require('path');
const { consulHost, consulPort, getRedisConfig } = require("./config/config");
const { startLobbyServer } = require('./servers/lobbyServer');
const { startGameServer } = require('./servers/gameServer');

const app = express();
const tlsCertPath = path.join(__dirname, 'tls', 'dev-cert.crt');
const tlsKeyPath = path.join(__dirname, 'tls', 'dev-key.key');
const options = {
    key: fs.readFileSync(tlsKeyPath),
    cert: fs.readFileSync(tlsCertPath)
};

const consul = new Consul({
    host: consulHost, port: consulPort
});

let redisClient;

const initializeServices = async () => {
    const redisHost = await getRedisConfig(consul);

    redisClient = redis.createClient({
        url: `redis://${redisHost.host}:${redisHost.port}/`,
    });

    await redisClient.connect();

    redisClient.on('error', err => console.log('Redis Client Error', err));

    startLobbyServer(app, options, consul, redisClient);
    startGameServer(app, options, consul, redisClient);
}

initializeServices().catch(err => {
    console.error("Failed to initialize services:", err);
    process.exit(1);
});

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cors({
    origin: '*'
}));

app.get('/health', (req, res) => {
    res.send("Server is running");
});

