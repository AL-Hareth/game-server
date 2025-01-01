import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create the connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Ensure you have this in your .env file
});

// Initialize Drizzle ORM
export const db = drizzle(pool);
