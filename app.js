const express = require('express');
const redis = require('redis');
const http = require('http');
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const redisClient = redis.createClient(
    {
        url: 'redis://localhost:6379/',
    }
);
redisClient.connect();
const {Server} = require("socket.io");
const {disconnect, join} = require("./sockets/lobbyws");
const url = require("url");

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});


app.get('/', (req, res) => {
    res.send("Server is running");
});

redisClient.on('error', err => console.log('Redis Client Error', err));


io.on('connection', socket => {
    join(io, socket, redisClient)
    disconnect(io, socket, redisClient);
});

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cors({
    origin: '*'
}));

app.listen(8003, () => console.log("server is running on 8003"));
io.listen(8004);