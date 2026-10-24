type Attempt = { count: number; resetAt: number };
const state = globalThis as typeof globalThis & { __loginAttempts?: Map<string, Attempt> };
const attempts = state.__loginAttempts ??= new Map<string, Attempt>();
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Process-local by design; a shared store is required before scaling replicas.
export function allowLoginAttempt(ip: string | null, now = Date.now(), store = attempts): boolean {
  const key = ip ?? "unverified-proxy";
  const entry = store.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= 10) return false;
    entry.count++;
    return true;
  }
  for (const [key, value] of store) if (now >= value.resetAt) store.delete(key);
  store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  return true;
}
