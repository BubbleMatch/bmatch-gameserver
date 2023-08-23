const express = require('express');
const redis = require('redis');
const cors = require("cors");
const Consul = require('consul');
const { Server } = require("socket.io");
const fs = require('fs');
const https = require('https'); // Используем модуль https
const path = require('path');
const {
    disconnect, join, generateGame, verifyLobby
} = require("./sockets/lobbyws");
const { consulHost, consulPort, getRedisConfig } = require("./config/config");

const app = express();
const tlsCertPath = path.join(__dirname, 'tls', 'dev-cert.crt');
const tlsKeyPath = path.join(__dirname, 'tls', 'dev-key.key');
const options = {
    key: fs.readFileSync(tlsKeyPath),
    cert: fs.readFileSync(tlsCertPath)
};

const server = https.createServer(options, app);

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
}

initializeServices().catch(err => {
    console.error("Failed to initialize services:", err);
    process.exit(1);
});

app.get('/health', (req, res) => {
    res.send("Server is running");
});

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

io.on('connection', socket => {
    join(io, socket, consul, redisClient);
    disconnect(io, socket, redisClient);
    generateGame(io, socket, redisClient, consul);
    verifyLobby(io, socket, redisClient, consul);
});

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cors({
    origin: '*'
}));

server.listen(8004, () => {
    console.log("Socket.IO server is running on 8004");
});