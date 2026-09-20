#!/usr/bin/env node
import { loadEnvFile } from 'node:process';
import { serve } from '@hono/node-server';

function loadLocalEnvironment(): void {
  try {
    loadEnvFile(process.env.ENV_FILE ?? '.env.local');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function main() {
  // Keep local development independent of production credentials in .env.
  loadLocalEnvironment();
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/productivity?sslmode=disable';
  // Database and auth modules read the environment at import time.
  const { default: app } = await import('./index');
  const port = Number(process.env.PORT || 8787);
  serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => {
    console.log(`API server running on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start the local API:', error.message);
  process.exit(1);
});
