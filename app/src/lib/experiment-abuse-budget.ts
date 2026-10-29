type Bucket = { count: number; until: number };
/** Process-local circuit breaker for the current single-replica deployment. Hashed keys only. */
export class ExperimentAbuseBudget {
  private buckets = new Map<string, Bucket>();
  private maximum: number;
  constructor(maximum = 10000) { this.maximum = maximum; }
  private take(key: string, limit: number, window: number, now: number) {
    const existing = this.buckets.get(key);
    if (existing && now < existing.until) {
      if (existing.count >= limit) return false;
      existing.count++; return true;
    }
    for (const [name, bucket] of this.buckets) if (now >= bucket.until) this.buckets.delete(name);
    if (this.buckets.size >= this.maximum) return false;
    this.buckets.set(key, { count: 1, until: now + window }); return true;
  }
  request(verifiedAddressDigest: string | null, now = Date.now()) {
    if (!this.take("global", 600, 60000, now)) return false;
    // Anonymous/unverified users do not share a restrictive pseudo-IP bucket.
    return verifiedAddressDigest === null || this.take("ip:" + verifiedAddressDigest, 120, 300000, now);
  }
  token(digest: string, now = Date.now()) { return this.take("token:" + digest, 40, 300000, now); }
}
const state = globalThis as typeof globalThis & { __experimentAbuseBudget?: ExperimentAbuseBudget };
export const experimentAbuseBudget = state.__experimentAbuseBudget ??= new ExperimentAbuseBudget();
