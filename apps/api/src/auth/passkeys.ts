import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db } from '@productivity-assistant/db-schema';
import { users } from '@productivity-assistant/db-schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const RP_NAME = 'Productivity Assistant';
const RP_ID = 'localhost'; // Change to your domain in production
const ORIGIN = 'http://localhost:5173'; // Change to your domain in production

interface PasskeyCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
}

export async function generateRegistrationOptionsForUser(userId: string) {
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0) throw new Error('User not found');

  const existingCredentials = user[0].passkeyCredentialId
    ? [{ id: user[0].passkeyCredentialId, type: 'public-key' as const, transports: ['internal'] as const }]
    : [];

  const options = generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userId,
    userName: user[0].email,
    userDisplayName: user[0].email,
    attestationType: 'none',
    excludeCredentials: existingCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256, RS256
  });

  return options;
}

export async function verifyRegistration(
  userId: string,
  response: any,
  expectedChallenge: string
) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed');
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

  await db.update(users)
    .set({
      passkeyCredentialId: credentialID,
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId));

  return {
    credentialId: credentialID,
    publicKey: credentialPublicKey,
    counter,
  };
}

export async function generateAuthenticationOptionsForUser(userId: string) {
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0 || !user[0].passkeyCredentialId) {
    throw new Error('No passkey registered for user');
  }

  const options = generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: [
      {
        id: user[0].passkeyCredentialId,
        type: 'public-key' as const,
        transports: ['internal', 'hybrid'] as const,
      },
    ],
    userVerification: 'required',
  });

  return options;
}

export async function verifyAuthentication(
  userId: string,
  response: any,
  expectedChallenge: string
) {
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0 || !user[0].passkeyCredentialId || !user[0].publicKey) {
    throw new Error('No passkey registered for user');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: user[0].passkeyCredentialId,
      credentialPublicKey: Buffer.from(user[0].publicKey, 'base64'),
      counter: 0, // In production, store and verify counter
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new Error('Authentication verification failed');
  }

  return true;
}

// Magic link / email authentication fallback
export async function createUser(email: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const userId = uuidv4();
  const [newUser] = await db.insert(users).values({
    id: userId,
    email,
    publicKey: '', // Will be set on passkey registration
  }).returning();

  return newUser;
}

export async function getUserByEmail(email: string) {
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user[0] || null;
}

export async function getUserById(id: string) {
  const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user[0] || null;
}