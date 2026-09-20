const configuredUrl = import.meta.env.VITE_API_URL as string | undefined;
export const API_URL = configuredUrl?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { message?: string; details?: unknown } } | null;
  if (!response.ok || !payload?.success) throw new ApiError(payload?.error?.message ?? `HTTP ${response.status}`, response.status, payload?.error?.details);
  return payload.data as T;
}

export function mutationHeaders(baseVersion?: number, idempotencyKey = crypto.randomUUID()): Record<string, string> {
  return { 'Idempotency-Key': idempotencyKey, ...(baseVersion ? { 'X-Base-Version': String(baseVersion) } : {}) };
}
