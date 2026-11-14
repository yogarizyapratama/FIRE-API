import { describe, expect, it } from 'bun:test';
import { applySecurityHeaders } from '../src/shield/headers';
import { handleCORS } from '../src/shield/cors';
import { RateLimiter } from '../src/shield/rate-limiter';
import { sanitizePayload } from '../src/shield/sanitizer';

describe('FireAPI FireShield Security Engine', () => {
  it('applies standard security headers to responses', () => {
    const baseResponse = new Response(JSON.stringify({ ok: true }));
    const securedResponse = applySecurityHeaders(baseResponse);

    expect(securedResponse.headers.get('x-content-type-options')).toBe('nosniff');
    expect(securedResponse.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(securedResponse.headers.get('x-xss-protection')).toBe('0');
    expect(securedResponse.headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('handles CORS preflight and standard requests', () => {
    const preflightReq = new Request('http://localhost:3000/api', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.client.com',
        'access-control-request-method': 'POST',
      },
    });

    const preflightRes = handleCORS(preflightReq, { origin: '*' });
    expect(preflightRes).not.toBeNull();
    expect(preflightRes?.status).toBe(204);
    expect(preflightRes?.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('enforces sliding-window rate limiting and rejects exceeding traffic', () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 1000 });
    const ip = '192.168.1.100';

    expect(limiter.check(ip).allowed).toBe(true);
    expect(limiter.check(ip).allowed).toBe(true);
    expect(limiter.check(ip).allowed).toBe(true);
    
    // 4th request exceeds max 3
    const fourth = limiter.check(ip);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfter).toBeGreaterThan(0);
  });

  it('detects and strips/rejects prototype pollution attempts', () => {
    const maliciousJson = JSON.parse('{"name":"admin","__proto__":{"isAdmin":true}}');
    const sanitized = sanitizePayload(maliciousJson);

    expect(sanitized.name).toBe('admin');
    expect((Object.prototype as any).isAdmin).toBeUndefined();
    expect((sanitized as any).__proto__.isAdmin).toBeUndefined();
  });
});
