import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { db } from './db';
import { cards } from './schema';
import { sql } from 'drizzle-orm';

interface Card {
    id: number;
    mainWord: string;
    wrongWords: string; // comma separated list
    approved: boolean;
    category: string;
}

interface GameState {
    roomId: string;
    teams: {
        A: string[];
        B: string[];
    };
    points: {
        A: number;
        B: number;
    },
    lastPlayerIndex: {
        A: number;
        B: number;
    },
    currentTeam: 'A' | 'B';
    currentPlayer: string;
    currentCard?: Card;
    skipsRemaining: number;
    timer?: NodeJS.Timeout;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

const PORT = 3000;

async function fetchCardFromDatabase(): Promise<Card> {
    // pick a random card
    const numberOfCards = await db.$count(cards);
    const randomId = Math.floor(Math.random() * numberOfCards) + 1;
    console.log(randomId);
    const card = await db.select().from(cards).limit(1).where(sql`id = ${randomId}`);

    return card[0];
}

// End turn
function endTurn(game: GameState) {
    const { currentTeam, teams, roomId } = game;

    if (game.teams.A.length === 0 || game.teams.B.length === 0) {
        io.to(roomId).emit('game-ended', { reason: 'A team has no players left' });
        if (game.timer) clearTimeout(game.timer); // Ensure timer is cleared
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
function startRoundTimer(game: GameState) {
    const { roomId } = game;

    game.timer = setTimeout(() => {
        io.to(roomId).emit('round-ended', { reason: 'timeout' });
        endTurn(game);
    }, 60000);
}


// Handle Card distribution
function sendCardToPlayers(game: GameState) {
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

// Room type definition
type Room = {
    players: string[];
};

// In-memory storage for rooms
const rooms: Record<string, GameState> = {};

// Middleware
app.use(express.json());

// List rooms
app.get('/rooms', (req: Request, res: Response) => {
    res.json(rooms);
});

// List room's members
app.get('/rooms/:roomId', (req: Request, res: Response): any => {
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
app.post('/create-room', (req: Request, res: Response) => {
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

    socket.on('join-room', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
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
        } else {
            game.teams.B.push(playerName);
        }

        socket.join(roomId);
        io.to(roomId).emit('player-joined', { playerName, teams: game.teams });
    });

    socket.on('start-game', async ({ roomId }: { roomId: string }) => {
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
        game.currentCard = await fetchCardFromDatabase();

        // Notify players
        io.to(roomId).emit('game-started', { game });
        sendCardToPlayers(game);
    });

    socket.on('action', ({ roomId, action }: { roomId: string; action: 'success' | 'fail' | 'skip' }) => {
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
                } else {
                    socket.emit('error', 'No skips remaining');
                }
                break;
        }
    });

    socket.on('leave-room', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
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
                if (game.timer) clearTimeout(game.timer); // Ensure timer is cleared
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
            if (game.timer) clearTimeout(game.timer); // Ensure timer is cleared
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

