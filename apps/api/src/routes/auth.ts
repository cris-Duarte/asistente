import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createUser, getUserByEmail, getUserById } from '../auth/passkeys';
import { createAccessToken, createRefreshToken, verifyRefreshToken, rotateRefreshToken } from '../auth/jwt';
import {
  generateRegistrationOptionsForUser,
  verifyRegistration,
  generateAuthenticationOptionsForUser,
  verifyAuthentication,
} from '../auth/passkeys';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';

const auth = new Hono();

// Rate limiting store (in production use KV/Durable Object)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(limit: number, windowMs: number) {
  return async (c: any, next: any) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const key = `ratelimit:${ip}:${c.req.path}`;
    const now = Date.now();

    const record = rateLimitStore.get(key);
    if (record && record.resetAt > now) {
      if (record.count >= limit) {
        throw new HTTPException(429, { message: 'Too many requests' });
      }
      record.count++;
    } else {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}

// Register new user (or get existing)
auth.post('/register', rateLimit(5, 60000), zValidator('json', z.object({
  email: z.string().email(),
})), async (c) => {
  const { email } = c.req.valid('json');
  const user = await createUser(email);
  return c.json({ success: true, data: { id: user.id, email: user.email } });
});

// Start passkey registration
auth.post('/passkey/registration/start', rateLimit(10, 60000), zValidator('json', z.object({
  userId: z.string().uuid(),
})), async (c) => {
  const { userId } = c.req.valid('json');
  const options = await generateRegistrationOptionsForUser(userId);

  // Store challenge in cookie (httpOnly, secure)
  setCookie(c, 'passkey_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  return c.json({ success: true, data: options });
});

// Complete passkey registration
auth.post('/passkey/registration/finish', rateLimit(10, 60000), zValidator('json', z.object({
  userId: z.string().uuid(),
  response: z.any(),
})), async (c) => {
  const { userId, response } = c.req.valid('json');
  const challenge = getCookie(c, 'passkey_challenge');

  if (!challenge) {
    throw new HTTPException(400, { message: 'Challenge expired or missing' });
  }

  await verifyRegistration(userId, response, challenge);
  deleteCookie(c, 'passkey_challenge', { path: '/' });

  const { accessToken, refreshToken } = await createTokens(userId, c.req.header('X-Device-ID') || 'web');

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return c.json({ success: true, data: { accessToken } });
});

// Start passkey authentication
auth.post('/passkey/authentication/start', rateLimit(10, 60000), zValidator('json', z.object({
  userId: z.string().uuid(),
})), async (c) => {
  const { userId } = c.req.valid('json');
  const options = await generateAuthenticationOptionsForUser(userId);

  setCookie(c, 'passkey_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 300,
    path: '/',
  });

  return c.json({ success: true, data: options });
});

// Complete passkey authentication
auth.post('/passkey/authentication/finish', rateLimit(10, 60000), zValidator('json', z.object({
  userId: z.string().uuid(),
  response: z.any(),
})), async (c) => {
  const { userId, response } = c.req.valid('json');
  const challenge = getCookie(c, 'passkey_challenge');

  if (!challenge) {
    throw new HTTPException(400, { message: 'Challenge expired or missing' });
  }

  await verifyAuthentication(userId, response, challenge);
  deleteCookie(c, 'passkey_challenge', { path: '/' });

  const { accessToken, refreshToken } = await createTokens(userId, c.req.header('X-Device-ID') || 'web');

  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return c.json({ success: true, data: { accessToken } });
});

// Refresh access token
auth.post('/refresh', async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');

  if (!refreshToken) {
    throw new HTTPException(401, { message: 'No refresh token' });
  }

  const tokens = await rotateRefreshToken(refreshToken);
  if (!tokens) {
    deleteCookie(c, 'refresh_token', { path: '/' });
    throw new HTTPException(401, { message: 'Invalid refresh token' });
  }

  setCookie(c, 'refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return c.json({ success: true, data: { accessToken: tokens.accessToken } });
});

// Logout
auth.post('/logout', async (c) => {
  deleteCookie(c, 'refresh_token', { path: '/' });
  return c.json({ success: true, data: { message: 'Logged out' } });
});

// Get current user
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const { verifyToken } = await import('../auth/jwt');
  const payload = await verifyToken(token);

  if (!payload) {
    throw new HTTPException(401, { message: 'Invalid token' });
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      hasPasskey: !!user.passkeyCredentialId,
    },
  });
});

async function createTokens(userId: string, deviceId: string) {
  const accessToken = await createAccessToken(userId, deviceId);
  const refreshToken = await createRefreshToken(userId, deviceId);
  return { accessToken, refreshToken };
}

export default auth;