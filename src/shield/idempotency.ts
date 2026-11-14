export interface CachedIdempotentResponse {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: string;
  expiresAt: number;
}

export class IdempotencyManager {
  private inFlightKeys = new Set<string>();
  private cache = new Map<string, CachedIdempotentResponse>();

  public isProcessing(key: string): boolean {
    return this.inFlightKeys.has(key);
  }

  public markProcessing(key: string): void {
    this.inFlightKeys.add(key);
  }

  public release(key: string): void {
    this.inFlightKeys.delete(key);
  }

  public get(key: string): CachedIdempotentResponse | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item;
  }

  public async storeResponse(key: string, response: Response, ttlSeconds = 86400): Promise<void> {
    try {
      const cloned = response.clone();
      const bodyText = await cloned.text();
      const headersRecord: Record<string, string> = {};

      response.headers.forEach((val, k) => {
        headersRecord[k] = val;
      });

      this.cache.set(key, {
        status: response.status,
        statusText: response.statusText,
        headers: headersRecord,
        body: bodyText,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    } catch {
      // Ignore if response body cannot be read
    } finally {
      this.release(key);
    }
  }

  public createResponse(cached: CachedIdempotentResponse): Response {
    const headers = new Headers(cached.headers);
    headers.set('X-Idempotent-Replay', 'true');

    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }

  public clear(): void {
    this.inFlightKeys.clear();
    this.cache.clear();
  }
}
