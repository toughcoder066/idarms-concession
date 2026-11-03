/**
 * Fixed-window limiter for the login, reset and invite forms. In memory, so
 * it is per portal instance; more than one instance needs a shared store.
 * ZITADEL's own lockout policy still applies to every password check.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one attempt for the key; false once the key is over its limit. */
  hit(key: string): boolean {
    const now = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

const MINUTE = 60_000;

export const limits = {
  loginByIp: new RateLimiter(20, 10 * MINUTE),
  loginByName: new RateLimiter(8, 10 * MINUTE),
  forgotByIp: new RateLimiter(5, 15 * MINUTE),
  forgotByName: new RateLimiter(3, 15 * MINUTE),
  codeByIp: new RateLimiter(10, 15 * MINUTE),
};
