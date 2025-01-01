"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const db_1 = require("./db");
const schema_1 = require("./schema");
const drizzle_orm_1 = require("drizzle-orm");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
const PORT = 3000;
function fetchCardFromDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        // pick a random card
        const numberOfCards = yield db_1.db.$count(schema_1.cards);
        const randomId = Math.floor(Math.random() * numberOfCards) + 1;
        const card = yield db_1.db.select().from(schema_1.cards).limit(1).where((0, drizzle_orm_1.sql) `id = ${randomId}`);
        return card[0];
    });
}
// End turn
function endTurn(game) {
    const { currentTeam, teams, roomId } = game;
    if (game.teams.A.length === 0 || game.teams.B.length === 0) {
        io.to(roomId).emit('game-ended', { reason: 'A team has no players left' });
        if (game.timer)
            clearTimeout(game.timer); // Ensure timer is cleared
        delete rooms[roomId];
        return;
    }
    // Switch teams
    game.currentTeam = currentTeam === 'A' ? 'B' : 'A';
    const newTeam = game.currentTeam;
    // Progress with the players in the team
    game.lastPlayerIndex[newTeam]++;
    // Rotate players in the team
    const currentTeamPlayers = teams[newTeam];
    const nextPlayerIndex = game.lastPlayerIndex[newTeam] % currentTeamPlayers.length;
    game.currentPlayer = currentTeamPlayers[nextPlayerIndex];
    // Reset skips
    game.skipsRemaining = 2;
    // Fetch a new card
    fetchCardFromDatabase().then((card) => {
        game.currentCard = card;
        sendCardToPlayers(game);
    });
}
// Handle Timer
function startRoundTimer(game) {
    const { roomId } = game;
    game.timer = setTimeout(() => {
        io.to(roomId).emit('round-ended', { reason: 'timeout' });
        endTurn(game);
    }, 60000);
}
// Handle Card distribution
function sendCardToPlayers(game) {
    const { currentTeam, currentPlayer, currentCard, roomId } = game;
    const opposingTeam = currentTeam === 'A' ? game.teams.B : game.teams.A;
    // Send the card to the current player
    io.to(roomId).emit('card-for-player', { player: currentPlayer, card: currentCard });
    // Send the card to the opposing team
    io.to(roomId).emit('card-for-opponents', { team: opposingTeam, card: currentCard });
    // Start the round timer
    startRoundTimer(game);
}
// create a room Id using 5 random charecters and numbers and symbols
function createRoomId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let roomId = '';
    do {
        roomId = Array.from({ length: 5 }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
    } while (rooms[roomId]); // Ensure no collision
    return roomId;
}
// In-memory storage for rooms
const rooms = {};
// Middleware
app.use(express_1.default.json());
// List rooms
app.get('/rooms', (req, res) => {
    res.json(rooms);
});
// List room's members
app.get('/rooms/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    if (!rooms[roomId]) {
        return res.status(404).json({ error: 'Room not found' });
    }
    const returnedData = rooms[roomId];
    delete returnedData.currentCard;
    delete returnedData.timer;
    res.json(rooms[roomId]);
});
// Create a new room
app.post('/create-room', (req, res) => {
    const roomId = createRoomId(); // Unique room ID
    rooms[roomId] = {
        roomId,
        teams: { A: [], B: [] },
        lastPlayerIndex: { A: 0, B: 0 },
        points: { A: 0, B: 0 },
        currentTeam: 'A',
        currentPlayer: '',
        skipsRemaining: 2,
    };
    res.json({ roomId });
});
// Join a room
// app.post('/join-room', (req: Request, res: Response): any => {
//     const { roomId, playerName }: { roomId: string; playerName: string } = req.body;
//
//     if (!rooms[roomId]) {
//         return res.status(404).json({ error: 'Room not found' });
//     }
//
//     const game = rooms[roomId];
//
//     // Assign player to a team alternately
//     const team = game.teams.A.length <= game.teams.B.length ? 'A' : 'B';
//     game.teams[team].push(playerName);
//
//     res.json({ message: 'Joined successfully', team, teams: game.teams });
// });
// Socket.io for real-time events
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);
    socket.on('join-room', ({ roomId, playerName }) => {
        if (!rooms[roomId]) {
            // Initialize the game state
            rooms[roomId] = {
                roomId,
                teams: { A: [], B: [] },
                lastPlayerIndex: { A: 0, B: 0 },
                points: { A: 0, B: 0 },
                currentTeam: 'A',
                currentPlayer: '',
                skipsRemaining: 2,
            };
        }
        const game = rooms[roomId];
        // Assign player to a team alternately
        if (game.teams.A.length <= game.teams.B.length) {
            game.teams.A.push(playerName);
        }
        else {
            game.teams.B.push(playerName);
        }
        socket.join(roomId);
        io.to(roomId).emit('player-joined', { playerName, teams: game.teams });
    });
    socket.on('start-game', (_a) => __awaiter(void 0, [_a], void 0, function* ({ roomId }) {
        const game = rooms[roomId];
        if (!game) {
            socket.emit('error', 'Room not found');
            return;
        }
        if (game.teams.A.length === 0 || game.teams.B.length === 0) {
            socket.emit('error', 'Both teams must have players to start the game');
            return;
        }
        game.currentTeam = 'A';
        game.currentPlayer = game.teams.A[0];
        game.skipsRemaining = 2;
        // Fetch the first card from the database
        game.currentCard = yield fetchCardFromDatabase();
        // Notify players
        io.to(roomId).emit('game-started', { game });
        sendCardToPlayers(game);
    }));
    socket.on('action', ({ roomId, action }) => {
        const game = rooms[roomId];
        if (!game) {
            socket.emit('error', 'Room not found');
            return;
        }
        clearTimeout(game.timer); // Stop the current timer
        switch (action) {
            case 'success':
                // Add point to team
                game.points[game.currentTeam] += 1;
                // Fetch a new card
                fetchCardFromDatabase().then((card) => {
                    game.currentCard = card;
                    sendCardToPlayers(game);
                });
                break;
            case 'fail':
                endTurn(game);
                break;
            case 'skip':
                if (game.skipsRemaining > 0) {
                    game.skipsRemaining -= 1;
                    fetchCardFromDatabase().then((card) => {
                        game.currentCard = card;
                        sendCardToPlayers(game);
                    });
                }
                else {
                    socket.emit('error', 'No skips remaining');
                }
                break;
        }
    });
    socket.on('leave-room', ({ roomId, playerName }) => {
        const game = rooms[roomId];
        if (!game) {
            socket.emit('error', 'Room not found');
            return;
        }
        // Remove player from their team
        game.teams.A = game.teams.A.filter((player) => player !== playerName);
        game.teams.B = game.teams.B.filter((player) => player !== playerName);
        // Handle if the current player left
        if (game.currentPlayer === playerName) {
            clearTimeout(game.timer); // Clear current turn's timer
            if (game.teams.A.length === 0 || game.teams.B.length === 0) {
                // Stop the game if a team is empty
                io.to(roomId).emit('game-ended', { reason: 'A team has no players left' });
                if (game.timer)
                    clearTimeout(game.timer); // Ensure timer is cleared
                delete rooms[roomId];
                return;
            }
            // Switch to the next turn
            endTurn(game);
        }
        // Notify the room of the updated teams
        io.to(roomId).emit('player-left', { playerName, teams: game.teams });
        // If no players are left, delete the room
        if (game.teams.A.length === 0 && game.teams.B.length === 0) {
            if (game.timer)
                clearTimeout(game.timer); // Ensure timer is cleared
            delete rooms[roomId];
        }
        socket.leave(roomId);
    });
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
