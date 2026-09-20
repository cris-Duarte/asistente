import { describe, expect, it } from 'vitest';
import { generateRecoveryCodes, hashSecret, normalizeRecoveryCode, randomToken } from './security';

describe('owner security primitives', () => {
  it('stores deterministic hashes instead of recoverable secrets', () => {
    expect(hashSecret('secret')).toHaveLength(64);
    expect(hashSecret('secret')).toBe(hashSecret('secret'));
    expect(hashSecret('secret')).not.toContain('secret');
  });

  it('generates ten unique high entropy recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => normalizeRecoveryCode(code).length === 32)).toBe(true);
  });

  it('generates URL-safe one-use token material', () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
