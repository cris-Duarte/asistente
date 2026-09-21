import { randomInt } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db, devicePairings, devices } from '@productivity-assistant/db-schema';
import { hashSecret, randomToken, rateLimit, type AuthVariables } from '../auth/security';
import { parseJson } from '../validation';

const router = new Hono<{ Variables: AuthVariables }>();

const pairingStartSchema = z.object({
  hardwareId: z.string().min(4).max(120),
  name: z.string().min(1).max(80).default('M5Stack Tab5'),
  firmwareVersion: z.string().max(40).optional(),
});

router.post('/pairing/start', rateLimit(10, 60), async (c) => {
  const input = await parseJson(c, pairingStartSchema);
  const existing = await db.select().from(devices).where(eq(devices.hardwareId, input.hardwareId)).limit(1);
  let device = existing[0];
  if (device?.userId && !device.revokedAt) throw new HTTPException(409, { message: 'El dispositivo ya está vinculado.' });
  if (device) {
    [device] = await db.update(devices).set({ name: input.name, firmwareVersion: input.firmwareVersion }).where(eq(devices.id, device.id)).returning();
  } else {
    [device] = await db.insert(devices).values(input).returning();
  }
  await db.delete(devicePairings).where(eq(devicePairings.deviceId, device.id));
  const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
  const pollingToken = randomToken();
  const [pairing] = await db.insert(devicePairings).values({
    deviceId: device.id,
    codeHash: hashSecret(code),
    pollingTokenHash: hashSecret(pollingToken),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  }).returning();
  return c.json({ success: true, data: { pairingId: pairing.id, code, pollingToken, expiresAt: pairing.expiresAt } }, 201);
});

const pairingPollSchema = z.object({
  pairingId: z.string().uuid(),
  pollingToken: z.string().min(32),
});

router.post('/pairing/poll', rateLimit(60, 60), async (c) => {
  const input = await parseJson(c, pairingPollSchema);
  const rows = await db.select().from(devicePairings).where(and(
    eq(devicePairings.id, input.pairingId),
    eq(devicePairings.pollingTokenHash, hashSecret(input.pollingToken)),
    gt(devicePairings.expiresAt, new Date()),
  )).limit(1);
  const pairing = rows[0];
  if (!pairing) throw new HTTPException(404, { message: 'Vinculación inválida o expirada.' });
  if (!pairing.confirmedAt) return c.json({ success: true, data: { status: 'pending' } }, 202);

  const token = randomToken();
  await db.transaction(async (tx) => {
    const claimed = await tx.update(devicePairings).set({ claimedAt: new Date() })
      .where(and(eq(devicePairings.id, pairing.id), isNull(devicePairings.claimedAt)))
      .returning({ deviceId: devicePairings.deviceId });
    if (!claimed[0]) throw new HTTPException(410, { message: 'La credencial ya fue entregada.' });
    await tx.update(devices).set({ tokenHash: hashSecret(token), pairedAt: new Date(), revokedAt: null })
      .where(eq(devices.id, claimed[0].deviceId));
  });
  return c.json({ success: true, data: { status: 'paired', token } });
});

router.post('/pair', async (c) => {
  const { code } = await parseJson(c, z.object({ code: z.string().regex(/^\d{8}$/) }));
  const rows = await db.select().from(devicePairings).where(and(
    eq(devicePairings.codeHash, hashSecret(code)),
    isNull(devicePairings.confirmedAt),
    gt(devicePairings.expiresAt, new Date()),
  )).limit(1);
  const pairing = rows[0];
  if (!pairing) throw new HTTPException(404, { message: 'Código inválido o expirado.' });
  await db.transaction(async (tx) => {
    await tx.update(devices).set({ userId: c.get('userId'), pairedAt: new Date(), revokedAt: null }).where(eq(devices.id, pairing.deviceId));
    await tx.update(devicePairings).set({ confirmedAt: new Date() }).where(eq(devicePairings.id, pairing.id));
  });
  return c.json({ success: true, data: { paired: true } });
});

router.get('/', async (c) => {
  const items = await db.select({
    id: devices.id,
    name: devices.name,
    hardwareId: devices.hardwareId,
    firmwareVersion: devices.firmwareVersion,
    scopes: devices.scopes,
    pairedAt: devices.pairedAt,
    lastSeenAt: devices.lastSeenAt,
  }).from(devices).where(and(eq(devices.userId, c.get('userId')), isNull(devices.revokedAt))).orderBy(desc(devices.pairedAt));
  return c.json({ success: true, data: items });
});

router.delete('/:id', async (c) => {
  const result = await db.update(devices).set({ revokedAt: new Date(), tokenHash: null }).where(and(
    eq(devices.id, c.req.param('id')),
    eq(devices.userId, c.get('userId')),
  )).returning({ id: devices.id });
  if (!result[0]) throw new HTTPException(404, { message: 'Dispositivo no encontrado.' });
  return c.json({ success: true, data: { revoked: true } });
});

export default router;
