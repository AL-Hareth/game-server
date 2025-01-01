declare namespace Express {
    export interface Request {
        body: {
            roomId: string;
            playerName: string;
        };
    }
}

