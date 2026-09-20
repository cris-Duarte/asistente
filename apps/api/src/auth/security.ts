import { createHash, randomBytes } from 'node:crypto';
import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createClient, type RedisClientType } from 'redis';
import { db, devices, sessions } from '@productivity-assistant/db-schema';

export type AuthKind = 'session' | 'device';
export type AuthVariables = {
  userId: string;
  authKind: AuthKind;
  sessionId?: string;
  deviceId?: string;
  recoveryRequired?: boolean;
};

const SESSION_COOKIE = 'pa_session';
const memoryChallenges = new Map<string, { value: string; expiresAt: number }>();
const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();
let redisClient: RedisClientType | null = null;
let redisFailed = false;

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function normalizeRecoveryCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'));
}

async function getRedis(): Promise<RedisClientType | null> {
  if (redisFailed) return null;
  if (redisClient?.isReady) return redisClient;
  const client = createClient({
    url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    socket: { reconnectStrategy: false, connectTimeout: 1500 },
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    redisClient = client as RedisClientType;
    return redisClient;
  } catch {
    redisFailed = true;
    return null;
  }
}

function assertSecurityStore(redis: RedisClientType | null): asserts redis is RedisClientType {
  if (!redis && process.env.NODE_ENV === 'production') {
    throw new HTTPException(503, { message: 'El almacén de seguridad no está disponible.' });
  }
}

export async function storeChallenge(id: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const encoded = JSON.stringify(value);
  const redis = await getRedis();
  if (redis) {
    await redis.set(`challenge:${id}`, encoded, { EX: ttlSeconds });
    return;
  }
  assertSecurityStore(redis);
  memoryChallenges.set(id, { value: encoded, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function consumeChallenge<T>(id: string): Promise<T | null> {
  const redis = await getRedis();
  if (redis) {
    const value = await redis.sendCommand(['GETDEL', `challenge:${id}`]);
    return typeof value === 'string' ? JSON.parse(value) as T : null;
  }
  assertSecurityStore(redis);
  const entry = memoryChallenges.get(id);
  memoryChallenges.delete(id);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return JSON.parse(entry.value) as T;
}

export function rateLimit(limit: number, windowSeconds: number) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0] ?? 'local';
    const key = `rate:${ip}:${c.req.path}`;
    const redis = await getRedis();
    let count: number;
    if (redis) {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
    } else {
      assertSecurityStore(redis);
      const now = Date.now();
      const current = memoryRateLimits.get(key);
      if (!current || current.expiresAt <= now) {
        memoryRateLimits.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
        count = 1;
      } else {
        current.count += 1;
        count = current.count;
      }
    }
    if (count > limit) throw new HTTPException(429, { message: 'Demasiados intentos. Intenta más tarde.' });
    await next();
  };
}

export async function createSession(
  c: Context,
  userId: string,
  options: { recoveryRequired?: boolean; shortLived?: boolean } = {},
): Promise<string> {
  const rawToken = randomToken();
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + (options.shortLived ? 15 * 60_000 : 90 * 24 * 60 * 60_000));
  const expiresAt = new Date(Math.min(absoluteExpiresAt.getTime(), now.getTime() + 30 * 24 * 60 * 60_000));
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSecret(rawToken),
    userAgent: c.req.header('User-Agent'),
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0],
    expiresAt,
    absoluteExpiresAt,
    recoveryRequired: options.recoveryRequired ?? false,
  });
  setCookie(c, SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'Strict',
    path: '/',
    maxAge: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
  });
  return rawToken;
}

export function clearSessionCookie(c: Context): void {
  setCookie(c, SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}

export async function authenticate(c: Context<{ Variables: AuthVariables }>, next: Next): Promise<void> {
  const now = new Date();
  const rawSession = getCookie(c, SESSION_COOKIE);
  if (rawSession) {
    const rows = await db.select().from(sessions).where(and(
      eq(sessions.tokenHash, hashSecret(rawSession)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
      gt(sessions.absoluteExpiresAt, now),
    )).limit(1);
    const session = rows[0];
    if (session) {
      const nextExpiry = new Date(Math.min(session.absoluteExpiresAt.getTime(), now.getTime() + 30 * 24 * 60 * 60_000));
      await db.update(sessions).set({ lastSeenAt: now, expiresAt: nextExpiry }).where(eq(sessions.id, session.id));
      setCookie(c, SESSION_COOKIE, rawSession, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE !== 'false',
        sameSite: 'Strict',
        path: '/',
        maxAge: Math.max(0, Math.floor((nextExpiry.getTime() - now.getTime()) / 1000)),
      });
      c.set('userId', session.userId);
      c.set('authKind', 'session');
      c.set('sessionId', session.id);
      c.set('recoveryRequired', session.recoveryRequired);
      if (session.recoveryRequired && !c.req.path.startsWith('/api/auth/')) {
        throw new HTTPException(403, { message: 'Registra una passkey nueva para completar la recuperación.' });
      }
      await next();
      return;
    }
    clearSessionCookie(c);
  }

  const authorization = c.req.header('Authorization');
  if (authorization?.startsWith('Bearer ')) {
    const tokenHash = hashSecret(authorization.slice(7));
    const rows = await db.select().from(devices).where(and(
      eq(devices.tokenHash, tokenHash),
      isNull(devices.revokedAt),
    )).limit(1);
    const device = rows[0];
    if (device?.userId) {
      const scopes = device.scopes ?? [];
      const path = c.req.path;
      const write = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method);
      const requiredScope = path.startsWith('/api/tasks') || path === '/api/shapes/tasks'
        ? `tasks:${write ? 'write' : 'read'}`
        : path.startsWith('/api/time-entries') || path === '/api/shapes/time-entries'
          ? `timer:${write ? 'write' : 'read'}`
          : null;
      if (!requiredScope || !scopes.includes(requiredScope)) {
        throw new HTTPException(403, { message: 'La credencial del dispositivo no tiene acceso a este recurso.' });
      }
      await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id));
      c.set('userId', device.userId);
      c.set('authKind', 'device');
      c.set('deviceId', device.id);
      await next();
      return;
    }
  }

  throw new HTTPException(401, { message: 'Autenticación requerida.' });
}
