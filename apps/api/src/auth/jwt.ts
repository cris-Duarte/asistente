import { SignJWT, jwtVerify, importSPKI, exportJWK } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-at-least-32-characters-long!!'
);

const ISSUER = 'productivity-assistant';
const AUDIENCE = 'productivity-assistant-client';

export async function createAccessToken(userId: string, deviceId: string): Promise<string> {
  return new SignJWT({ sub: userId, deviceId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function createRefreshToken(userId: string, deviceId: string): Promise<string> {
  return new SignJWT({ sub: userId, deviceId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      userId: payload.sub as string,
      deviceId: payload.deviceId as string,
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.type !== 'refresh') return null;
    return {
      userId: payload.sub as string,
      deviceId: payload.deviceId as string,
    };
  } catch {
    return null;
  }
}

export async function rotateRefreshToken(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const payload = await verifyRefreshToken(oldToken);
  if (!payload) return null;

  const accessToken = await createAccessToken(payload.userId, payload.deviceId);
  const refreshToken = await createRefreshToken(payload.userId, payload.deviceId);

  return { accessToken, refreshToken };
}