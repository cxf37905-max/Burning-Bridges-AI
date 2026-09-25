import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await migrate(drizzle(client), {
    migrationsFolder: resolve(process.cwd(), 'src/db/migrations'),
  });
  console.log('Database migrations completed');
} finally {
  await client.end();
}
