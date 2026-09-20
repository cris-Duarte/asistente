import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { db, passkeyCredentials, users } from '@productivity-assistant/db-schema';

const rpName = process.env.WEBAUTHN_RP_NAME ?? 'Productivity Assistant';
const rpId = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const expectedOrigin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173';

function bytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function credentialId(value: string | Uint8Array): string {
  return typeof value === 'string' ? value : Buffer.from(value).toString('base64url');
}

export async function registrationOptions(userId: string) {
  const [owner, credentials] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(passkeyCredentials).where(eq(passkeyCredentials.userId, userId)),
  ]);
  if (!owner[0]) throw new Error('Propietario no encontrado.');
  return generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: new TextEncoder().encode(userId),
    userName: owner[0].email,
    userDisplayName: owner[0].name,
    attestationType: 'none',
    excludeCredentials: credentials.map((item) => ({
      id: item.credentialId,
      transports: item.transports as any,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    supportedAlgorithmIDs: [-7, -257],
  });
}

export async function saveRegistration(userId: string, response: any, challenge: string, name = 'Passkey') {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: rpId,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error('No se pudo verificar la passkey.');

  const info = verification.registrationInfo as any;
  const id = credentialId(info.credential?.id ?? info.credentialID);
  const publicKey = info.credential?.publicKey ?? info.credentialPublicKey;
  const counter = info.credential?.counter ?? info.counter ?? 0;
  const [saved] = await db.insert(passkeyCredentials).values({
    userId,
    credentialId: id,
    publicKey: bytesToBase64(publicKey),
    counter,
    transports: response.response?.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp ?? false,
    name,
  }).returning();
  return saved;
}

export async function authenticationOptions() {
  return generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'required',
    allowCredentials: [],
  });
}

export async function verifyAuthentication(response: any, challenge: string) {
  const id = response.id as string;
  const rows = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.credentialId, id)).limit(1);
  const credential = rows[0];
  if (!credential) throw new Error('Passkey desconocida.');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: rpId,
    authenticator: {
      credentialID: credential.credentialId,
      credentialPublicKey: Buffer.from(credential.publicKey, 'base64'),
      counter: credential.counter,
      transports: credential.transports as any,
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error('No se pudo verificar la passkey.');
  await db.update(passkeyCredentials).set({
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: new Date(),
  }).where(and(eq(passkeyCredentials.id, credential.id), eq(passkeyCredentials.counter, credential.counter)));
  return credential;
}
