import { describe, expect, it } from 'vitest';
import { canApplyServerVersion, isMutationSuccess, retryDelayMs } from './sync-model';

describe('offline mutation semantics', () => {
  it('uses bounded exponential retries', () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(99)).toBe(256000);
  });

  it('preserves pending local writes and rejects stale server rows', () => {
    expect(canApplyServerVersion(2, true, 9)).toBe(false);
    expect(canApplyServerVersion(3, false, 2)).toBe(false);
    expect(canApplyServerVersion(3, false, 3)).toBe(true);
  });

  it('only acknowledges successful HTTP mutations', () => {
    expect(isMutationSuccess(201)).toBe(true);
    expect(isMutationSuccess(409)).toBe(false);
    expect(isMutationSuccess(503)).toBe(false);
  });
});
