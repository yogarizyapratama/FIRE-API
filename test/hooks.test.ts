import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Lifecycle Interceptors & Hooks (app.hook)', () => {
  it('intercepts request early via onRequest hook', async () => {
    const app = createApp();
    const router = createRouter();

    let hookExecuted = false;

    // Reject IP if blacklisted
    app.hook('onRequest', async (ctx) => {
      hookExecuted = true;
      if (ctx.req.headers.get('x-blocked-client') === 'true') {
        return ctx.forbidden('Access blocked by security hook');
      }
    });

    router.get('/data', (ctx) => ctx.ok({ secret: 'safe' }));
    app.use(router);

    // 1. Blocked request
    const resBlocked = await app.handle(
      new Request('http://localhost:3000/data', {
        headers: { 'x-blocked-client': 'true' },
      })
    );
    expect(resBlocked.status).toBe(403);
    expect(hookExecuted).toBe(true);

    // 2. Normal request
    const resNormal = await app.handle(new Request('http://localhost:3000/data'));
    expect(resNormal.status).toBe(200);
  });

  it('modifies response via afterHandle hook', async () => {
    const app = createApp();
    const router = createRouter();

    app.hook('afterHandle', async (ctx, response) => {
      const headers = new Headers(response.headers);
      headers.set('X-Global-Audit', 'verified');
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    });

    router.get('/items', (ctx) => ctx.ok(['item1', 'item2']));
    app.use(router);

    const res = await app.handle(new Request('http://localhost:3000/items'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Global-Audit')).toBe('verified');
  });

  it('captures uncaught errors via onError hook', async () => {
    const app = createApp();
    const router = createRouter();

    let capturedError: any = null;

    app.hook('onError', async (err) => {
      capturedError = err;
    });

    router.get('/crash', () => {
      throw new Error('Database connection explosion');
    });
    app.use(router);

    const res = await app.handle(new Request('http://localhost:3000/crash'));
    expect(res.status).toBe(500);
    expect(capturedError).not.toBeNull();
    expect(capturedError.message).toBe('Database connection explosion');
  });
});
