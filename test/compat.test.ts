import { describe, expect, it } from 'bun:test';
import { fromExpress } from '../src/compat/express';
import { createApp } from '../src/core/app';

describe('FireAPI Express Compatibility Bridge (fire-api/compat)', () => {
  it('bridges standard Express middleware that modifies headers or state', async () => {
    const app = createApp();

    // Standard Express middleware: (req, res, next)
    const expressLogger = (req: any, res: any, next: any) => {
      req.customId = 'exp_123';
      res.setHeader('X-Express-Bridged', 'true');
      next();
    };

    app.get('/test-compat', {
      middlewares: [fromExpress(expressLogger)],
      handler: (ctx) => {
        return ctx.ok({ bridgedId: (ctx.req as any).customId });
      },
    });

    const res = await app.handle(new Request('http://localhost:3000/test-compat'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-express-bridged')).toBe('true');
    const data = await res.json();
    expect(data.bridgedId).toBe('exp_123');
  });

  it('handles early termination from Express middleware (e.g. res.status().json())', async () => {
    const app = createApp();

    // Middleware that intercepts and rejects early
    const expressBlocker = (_req: any, res: any, _next: any) => {
      res.status(403).json({ blockedBy: 'express-guard' });
    };

    app.get('/blocked', {
      middlewares: [fromExpress(expressBlocker)],
      handler: (ctx) => ctx.ok({ secret: 'never reached' }),
    });

    const res = await app.handle(new Request('http://localhost:3000/blocked'));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.blockedBy).toBe('express-guard');
  });
});
