const express = require('express');
const redis = require('redis');
const http = require('http');
const cors = require("cors");
const Consul = require('consul');
const { Server } = require("socket.io");
const { disconnect, join, generateGame } = require("./sockets/lobbyws");
const { consulHost, consulPort, getRedisConfig } = require("./config/config");

const app = express();
const server = http.createServer(app);

const consul = new Consul({
    host: consulHost,
    port: consulPort
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
    join(io, socket, redisClient);
    disconnect(io, socket, redisClient);
    generateGame(io, socket, redisClient, consul);
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
    origin: '*'
}));

app.listen(8003, () => console.log("server is running on 8003"));
io.listen(8004);
