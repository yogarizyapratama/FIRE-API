export interface RateLimiterOptions {
  max: number;
  windowMs?: number;
  window?: string; // '1m', '15m', '1h', etc.
}

export function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)(s|m|h|d)?$/);
  if (!match) return 60000; // default 1m
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    case 'd': return val * 86400 * 1000;
    default: return val * 1000;
  }
}

export class RateLimiter {
  private hits: Map<string, number[]> = new Map();
  private max: number;
  private windowMs: number;
  private cleanupTimer?: any;

  constructor(options: RateLimiterOptions) {
    this.max = options.max;
    this.windowMs = options.windowMs || (options.window ? parseDuration(options.window) : 60000);

    // Periodically prune stale keys to guarantee zero memory leaks
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs * 2);
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  public check(key: string): { allowed: boolean; remaining: number; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.hits.get(key) || [];
    // Filter timestamps within current sliding window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.max) {
      const oldestHit = timestamps[0];
      const retryAfter = Math.ceil((oldestHit + this.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter: Math.max(retryAfter, 1) };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.max - timestamps.length,
    };
  }

  public cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
