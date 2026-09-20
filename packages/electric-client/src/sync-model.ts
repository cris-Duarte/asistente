export function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1000 * 2 ** Math.min(Math.max(attempts, 0), 8));
}

export function canApplyServerVersion(localVersion: number, hasPendingWrite: boolean, serverVersion: number): boolean {
  return !hasPendingWrite && serverVersion >= localVersion;
}

export function isMutationSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}
