import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { and, count, eq, gt, isNull, ne } from 'drizzle-orm';
import {
  db,
  passkeyCredentials,
  recoveryCodes,
  sessions,
  setupTokens,
  users,
} from '@productivity-assistant/db-schema';
import {
  authenticationOptions,
  registrationOptions,
  saveRegistration,
  verifyAuthentication,
} from '../auth/passkeys';
import {
  clearSessionCookie,
  consumeChallenge,
  createSession,
  generateRecoveryCodes,
  hashSecret,
  normalizeRecoveryCode,
  randomToken,
  rateLimit,
  storeChallenge,
  type AuthVariables,
} from '../auth/security';
import { parseJson } from '../validation';

const auth = new Hono<{ Variables: AuthVariables }>();
const responseSchema = z.object({ response: z.any(), ceremonyId: z.string().min(20), name: z.string().min(1).max(80).optional() });

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    preferences: user.preferences,
  };
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(codes.map((code) => ({
      userId,
      codeHash: hashSecret(normalizeRecoveryCode(code)),
    })));
  });
  return codes;
}

auth.get('/setup/status', async (c) => {
  const [ownerRows, credentialCount] = await Promise.all([
    db.select().from(users).limit(1),
    db.select({ count: count() }).from(passkeyCredentials),
  ]);
  return c.json({
    success: true,
    data: {
      ownerInitialized: ownerRows.length === 1,
      setupRequired: ownerRows.length === 1 && Number(credentialCount[0]?.count ?? 0) === 0,
    },
  });
});

auth.post('/setup/passkey/options', rateLimit(8, 60), async (c) => {
  const { token } = await parseJson(c, z.object({ token: z.string().min(32) }));
  const rows = await db.select().from(setupTokens).where(and(
    eq(setupTokens.tokenHash, hashSecret(token)),
    isNull(setupTokens.usedAt),
    gt(setupTokens.expiresAt, new Date()),
  )).limit(1);
  const setup = rows[0];
  if (!setup) throw new HTTPException(401, { message: 'El enlace de configuración es inválido o expiró.' });
  const existing = await db.select({ count: count() }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, setup.userId));
  if (Number(existing[0]?.count ?? 0) > 0) throw new HTTPException(409, { message: 'La configuración inicial ya fue completada.' });
  const options = await registrationOptions(setup.userId);
  const ceremonyId = randomToken();
  await storeChallenge(ceremonyId, { purpose: 'setup', userId: setup.userId, challenge: options.challenge, tokenHash: setup.tokenHash });
  return c.json({ success: true, data: { options, ceremonyId } });
});

auth.post('/setup/passkey/verify', rateLimit(8, 60), async (c) => {
  const { token, response, ceremonyId, name } = await parseJson(c, responseSchema.extend({ token: z.string().min(32) }));
  const challenge = await consumeChallenge<{ purpose: string; userId: string; challenge: string; tokenHash: string }>(ceremonyId);
  if (!challenge || challenge.purpose !== 'setup' || challenge.tokenHash !== hashSecret(token)) {
    throw new HTTPException(400, { message: 'La ceremonia expiró. Iníciala nuevamente.' });
  }
  const setupRows = await db.select().from(setupTokens).where(and(
    eq(setupTokens.tokenHash, challenge.tokenHash),
    isNull(setupTokens.usedAt),
    gt(setupTokens.expiresAt, new Date()),
  )).limit(1);
  if (!setupRows[0]) throw new HTTPException(401, { message: 'El enlace de configuración expiró.' });
  await saveRegistration(challenge.userId, response, challenge.challenge, name ?? 'Passkey principal');
  await db.update(setupTokens).set({ usedAt: new Date() }).where(eq(setupTokens.userId, challenge.userId));
  const codes = await replaceRecoveryCodes(challenge.userId);
  await createSession(c, challenge.userId);
  const [owner] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  return c.json({ success: true, data: { user: publicUser(owner), recoveryCodes: codes } });
});

auth.post('/passkey/options', rateLimit(12, 60), async (c) => {
  const registered = await db.select({ count: count() }).from(passkeyCredentials);
  if (Number(registered[0]?.count ?? 0) === 0) throw new HTTPException(409, { message: 'La cuenta todavía no tiene una passkey.' });
  const options = await authenticationOptions();
  const ceremonyId = randomToken();
  await storeChallenge(ceremonyId, { purpose: 'login', challenge: options.challenge });
  return c.json({ success: true, data: { options, ceremonyId } });
});

auth.post('/passkey/verify', rateLimit(12, 60), async (c) => {
  const { response, ceremonyId } = await parseJson(c, responseSchema);
  const challenge = await consumeChallenge<{ purpose: string; challenge: string }>(ceremonyId);
  if (!challenge || challenge.purpose !== 'login') throw new HTTPException(400, { message: 'La ceremonia expiró.' });
  const credential = await verifyAuthentication(response, challenge.challenge);
  await createSession(c, credential.userId);
  const [owner] = await db.select().from(users).where(eq(users.id, credential.userId)).limit(1);
  return c.json({ success: true, data: { user: publicUser(owner) } });
});

auth.post('/recovery', rateLimit(5, 15 * 60), async (c) => {
  const { code } = await parseJson(c, z.object({ code: z.string().min(16) }));
  const rows = await db.select().from(recoveryCodes).where(and(
    eq(recoveryCodes.codeHash, hashSecret(normalizeRecoveryCode(code))),
    isNull(recoveryCodes.usedAt),
  )).limit(1);
  const recovery = rows[0];
  if (!recovery) throw new HTTPException(401, { message: 'Código inválido o utilizado.' });
  await db.update(recoveryCodes).set({ usedAt: new Date() }).where(and(eq(recoveryCodes.id, recovery.id), isNull(recoveryCodes.usedAt)));
  await createSession(c, recovery.userId, { recoveryRequired: true, shortLived: true });
  return c.json({ success: true, data: { recoveryRequired: true } });
});

auth.get('/me', async (c) => {
  const [owner, credentialCount] = await Promise.all([
    db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1),
    db.select({ count: count() }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, c.get('userId'))),
  ]);
  if (!owner[0]) throw new HTTPException(404, { message: 'Propietario no encontrado.' });
  return c.json({ success: true, data: { ...publicUser(owner[0]), passkeyCount: Number(credentialCount[0]?.count ?? 0), recoveryRequired: c.get('recoveryRequired') ?? false } });
});

auth.patch('/me', async (c) => {
  const input = await parseJson(c, z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(80).optional(),
  preferences: z.record(z.unknown()).optional(),
  }));
  const [owner] = await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, c.get('userId'))).returning();
  return c.json({ success: true, data: publicUser(owner) });
});

auth.post('/logout', async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  clearSessionCookie(c);
  return c.json({ success: true, data: { loggedOut: true } });
});

auth.get('/passkeys', async (c) => {
  const items = await db.select({
    id: passkeyCredentials.id,
    name: passkeyCredentials.name,
    transports: passkeyCredentials.transports,
    deviceType: passkeyCredentials.deviceType,
    backedUp: passkeyCredentials.backedUp,
    createdAt: passkeyCredentials.createdAt,
    lastUsedAt: passkeyCredentials.lastUsedAt,
  }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, c.get('userId')));
  return c.json({ success: true, data: items });
});

auth.post('/passkeys/options', async (c) => {
  const options = await registrationOptions(c.get('userId'));
  const ceremonyId = randomToken();
  await storeChallenge(ceremonyId, { purpose: 'add-passkey', userId: c.get('userId'), challenge: options.challenge });
  return c.json({ success: true, data: { options, ceremonyId } });
});

auth.post('/passkeys/verify', async (c) => {
  const { response, ceremonyId, name } = await parseJson(c, responseSchema);
  const challenge = await consumeChallenge<{ purpose: string; userId: string; challenge: string }>(ceremonyId);
  if (!challenge || challenge.purpose !== 'add-passkey' || challenge.userId !== c.get('userId')) {
    throw new HTTPException(400, { message: 'La ceremonia expiró.' });
  }
  const credential = await saveRegistration(challenge.userId, response, challenge.challenge, name);
  let codes: string[] | undefined;
  if (c.get('recoveryRequired')) {
    codes = await replaceRecoveryCodes(challenge.userId);
    const now = Date.now();
    await db.update(sessions).set({
      recoveryRequired: false,
      expiresAt: new Date(now + 30 * 24 * 60 * 60_000),
      absoluteExpiresAt: new Date(now + 90 * 24 * 60 * 60_000),
    }).where(eq(sessions.id, c.get('sessionId')!));
  }
  return c.json({ success: true, data: { credential: { id: credential.id, name: credential.name }, recoveryCodes: codes } });
});

auth.delete('/passkeys/:id', async (c) => {
  const userId = c.get('userId');
  const [credentialCount, recoveryCount] = await Promise.all([
    db.select({ count: count() }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, userId)),
    db.select({ count: count() }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt))),
  ]);
  if (Number(credentialCount[0]?.count ?? 0) <= 1 && Number(recoveryCount[0]?.count ?? 0) === 0) {
    throw new HTTPException(409, { message: 'No puedes eliminar la última passkey sin códigos de recuperación activos.' });
  }
  const removed = await db.delete(passkeyCredentials).where(and(eq(passkeyCredentials.id, c.req.param('id')), eq(passkeyCredentials.userId, userId))).returning({ id: passkeyCredentials.id });
  if (!removed[0]) throw new HTTPException(404, { message: 'Passkey no encontrada.' });
  return c.json({ success: true, data: { deleted: true } });
});

auth.post('/recovery-codes/rotate', async (c) => {
  const codes = await replaceRecoveryCodes(c.get('userId'));
  return c.json({ success: true, data: { recoveryCodes: codes } });
});

auth.get('/sessions', async (c) => {
  const items = await db.select({
    id: sessions.id,
    userAgent: sessions.userAgent,
    ipAddress: sessions.ipAddress,
    createdAt: sessions.createdAt,
    lastSeenAt: sessions.lastSeenAt,
    expiresAt: sessions.expiresAt,
  }).from(sessions).where(and(eq(sessions.userId, c.get('userId')), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  return c.json({ success: true, data: items.map((item) => ({ ...item, current: item.id === c.get('sessionId') })) });
});

auth.delete('/sessions/:id', async (c) => {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, c.req.param('id')), eq(sessions.userId, c.get('userId'))));
  if (c.req.param('id') === c.get('sessionId')) clearSessionCookie(c);
  return c.json({ success: true, data: { revoked: true } });
});

auth.delete('/sessions', async (c) => {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, c.get('userId')), ne(sessions.id, c.get('sessionId')!)));
  return c.json({ success: true, data: { revoked: true } });
});

export default auth;
