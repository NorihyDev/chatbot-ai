// Per-process protection for a private, single-owner app. Use a shared limiter
// and platform firewall when scaling across instances.
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetsAt: number }>();
  constructor(private limit: number, private windowMs: number) {}
  take(key: string, now = Date.now()) {
    for (const [id, bucket] of this.buckets) if (bucket.resetsAt <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 5_000) return false;
      bucket = { count: 0, resetsAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.limit) return false;
    bucket.count++;
    return true;
  }
}

export const chatLimiter = new RateLimiter(20, 60_000);
export const loginLimiter = new RateLimiter(10, 60_000);
