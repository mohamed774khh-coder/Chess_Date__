
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game State
const rooms = {};
const globalStats = {}; // { playerName: { wins: 0, losses: 0, name: "..." } }

function updateGlobalStats(name, result) {
    if (!name || name === 'Player') return;
    if (!globalStats[name]) {
        globalStats[name] = { name, wins: 0, losses: 0 };
    }
    if (result === 'win') globalStats[name].wins++;
    else if (result === 'loss') globalStats[name].losses++;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_room', ({ room, name }) => {
        // Initialize room if it doesn't exist
        if (!rooms[room]) {
            rooms[room] = {
                players: [],
                spectators: [],
                turn: 'white',
                boardState: null
            };
        }

        const currentRoom = rooms[room];

        // Check availability
        if (currentRoom.players.length >= 2) {
            // Join as Spectator
            const spectator = { id: socket.id, name, room, role: 'spectator' };
            currentRoom.spectators.push(spectator);
            socket.join(room);

            socket.emit('spectator_role', {
                room,
                white: currentRoom.players.find(p => p.color === 'white')?.name || '?',
                black: currentRoom.players.find(p => p.color === 'black')?.name || '?'
            });

            // If game is in progress, maybe send current board state? 
            // For now, client will just see moves from now on or request sync.
            // A robust way is to store move history in room and send it.
            return;
        }

        // Assign color
        const color = currentRoom.players.length === 0 ? 'white' : 'black';

        const player = {
            id: socket.id,
            name: name,
            color: color,
            room: room,
            role: 'player'
        };

        currentRoom.players.push(player);
        socket.join(room);

        // Notify player of their role
        socket.emit('player_role', { color, name });

        // If room is full, start game
        if (currentRoom.players.length === 2) {
            const whitePlayer = currentRoom.players.find(p => p.color === 'white');
            const blackPlayer = currentRoom.players.find(p => p.color === 'black');

            io.to(room).emit('start_game', {
                white: whitePlayer.name,
                black: blackPlayer.name
            });
        }
    });

    // Matchmaking Queue
    let matchmakingQueue = [];

    socket.on('join_queue', (name) => {
        const player = { id: socket.id, name };
        matchmakingQueue.push(player);

        console.log(`User ${name} joined matchmaking. Queue size: ${matchmakingQueue.length}`);

        if (matchmakingQueue.length >= 2) {
            const p1 = matchmakingQueue.shift();
            const p2 = matchmakingQueue.shift();

            const roomId = `match_${Date.now()}`;

            // Notify both to join this room
            io.to(p1.id).emit('match_found', { room: roomId });
            io.to(p2.id).emit('match_found', { room: roomId });
        }
    });

    socket.on('move', (moveData) => {
        const player = getPlayer(socket.id);
        if (player) {
            // Broadcast move to everyone else in the room
            socket.to(player.room).emit('opponent_move', moveData);
        }
    });

    socket.on('power', (powerData) => {
        const player = getPlayer(socket.id);
        if (player) {
            socket.to(player.room).emit('opponent_power', powerData);
        }
    });

    socket.on('chat_message', (msg) => {
        const player = getPlayer(socket.id);
        if (player) {
            io.to(player.room).emit('chat_message', {
                author: player.name,
                text: msg,
                color: player.color
            });
        }
    });

    socket.on('emoji', (emoji) => {
        const player = getPlayer(socket.id);
        if (player) {
            io.to(player.room).emit('emoji', {
                author: player.name,
                text: emoji,
                color: player.color
            });
        }
    });

    socket.on('game_end', (result) => {
        const player = getPlayer(socket.id);
        if (player) {
            io.to(player.room).emit('game_over', result);

            // Update Leaderboard
            if (result.winner) {
                const room = rooms[player.room];
                if (room) {
                    const winnerPlayer = room.players.find(p => p.color === result.winner);
                    const loserPlayer = room.players.find(p => p.color !== result.winner);

                    if (winnerPlayer) updateGlobalStats(winnerPlayer.name, 'win');
                    if (loserPlayer) updateGlobalStats(loserPlayer.name, 'loss');
                }
            }
        }
    });

    socket.on('resign', () => {
        const player = getPlayer(socket.id);
        if (player) {
            socket.to(player.room).emit('opponent_resigned');

            // Update Leaderboard (Opponent wins, Player loses)
            const room = rooms[player.room];
            if (room) {
                const opponent = room.players.find(p => p.id !== socket.id);
                if (opponent) updateGlobalStats(opponent.name, 'win');
                updateGlobalStats(player.name, 'loss');
            }
        }
    });

    socket.on('rematch_request', () => {
        const player = getPlayer(socket.id);
        if (player && rooms[player.room]) {
            const room = rooms[player.room];
            player.rematchRequested = true;

            // Check if both requested
            const allRequested = room.players.every(p => p.rematchRequested);
            if (allRequested && room.players.length === 2) {
                // Reset flags
                room.players.forEach(p => p.rematchRequested = false);

                // Restart Game
                const whitePlayer = room.players.find(p => p.color === 'white');
                const blackPlayer = room.players.find(p => p.color === 'black');

                io.to(player.room).emit('start_game', {
                    white: whitePlayer.name,
                    black: blackPlayer.name
                });
            }
        }
    });

    socket.on('request_leaderboard', () => {
        const leaderboard = Object.values(globalStats)
            .sort((a, b) => b.wins - a.wins)
            .slice(0, 10); // Top 10
        socket.emit('leaderboard_data', leaderboard);
    });

    socket.on('disconnect', () => {
        const player = getPlayer(socket.id);
        if (player) {
            console.log(`${player.name} disconnected`);
            // Remove player from room
            if (rooms[player.room]) {
                const room = rooms[player.room];

                if (player.role === 'spectator') {
                    room.spectators = room.spectators.filter(p => p.id !== socket.id);
                } else {
                    room.players = room.players.filter(p => p.id !== socket.id);
                    // Notify opponent
                    io.to(player.room).emit('player_left', player.name);
                }

                // If room empty, delete it
                if (room.players.length === 0 && room.spectators.length === 0) {
                    delete rooms[player.room];
                }
            }
        }
    });
});

function getPlayer(socketId) {
    for (const room in rooms) {
        const player = rooms[room].players.find(p => p.id === socketId);
        if (player) return player;

        const spectator = rooms[room].spectators.find(p => p.id === socketId);
        if (spectator) return spectator;
    }
    return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
