#!/usr/bin/env node
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(process.env.ENV_FILE ?? '.env.local');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/productivity?sslmode=disable';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argument('email') ?? process.env.OWNER_EMAIL;
  const name = argument('name') ?? process.env.OWNER_NAME;
  if (!email || !name) {
    throw new Error('Uso: pnpm owner:init -- --email tu@email.com --name "Tu nombre"');
  }
  const [{ db, passkeyCredentials, setupTokens, users }, { count, eq }, { hashSecret, randomToken }] = await Promise.all([
    import('@productivity-assistant/db-schema'),
    import('drizzle-orm'),
    import('../auth/security'),
  ]);
  const existing = await db.select().from(users).limit(1);
  let owner = existing[0];
  if (owner && owner.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`Ya existe el propietario ${owner.email}; no se creará otra cuenta.`);
  }
  if (!owner) {
    [owner] = await db.insert(users).values({ email: email.toLowerCase(), name }).returning();
  } else if (owner.name !== name) {
    [owner] = await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, owner.id)).returning();
  }
  const registered = await db.select({ count: count() }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, owner.id));
  if (Number(registered[0]?.count ?? 0) > 0) {
    console.log(`El propietario ${owner.email} ya tiene una passkey. Gestiona accesos desde Ajustes.`);
    return;
  }
  await db.delete(setupTokens).where(eq(setupTokens.userId, owner.id));
  const token = randomToken(32);
  await db.insert(setupTokens).values({
    userId: owner.id,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  const webUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  console.log(`Abre este enlace antes de 30 minutos:\n${webUrl}/setup#token=${token}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
