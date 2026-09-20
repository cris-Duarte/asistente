import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

export const sqlClient = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  idle_timeout: 20,
});

export const db = drizzle(sqlClient, { schema });

export type DB = typeof db;
