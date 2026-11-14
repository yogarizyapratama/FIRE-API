import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';
import { computeHMAC } from '../src/shield/webhook';

describe('FireAPI Turnkey Webhook HMAC Verifier (ctx.webhook.verifyHMAC)', () => {
  it('verifies standard SHA-256 HMAC signature using raw request body', async () => {
    const app = createApp();
    const router = createRouter();
    const secret = 'super-secret-signing-key-999';

    router.post('/webhooks/payment', async (ctx) => {
      const isValid = await ctx.webhook.verifyHMAC({
        secret,
        header: 'x-signature-256',
      });

      if (!isValid) {
        return ctx.unauthorized('Invalid webhook signature');
      }

      return ctx.ok({ verified: true, event: ctx.body.event });
    });

    app.use(router);

    const payload = JSON.stringify({ event: 'charge.succeeded', amount: 5000 });
    const validSignature = await computeHMAC(payload, secret, 'SHA-256');

    // 1. Valid Signature -> 200 OK
    const resValid = await app.handle(
      new Request('http://localhost:3000/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature-256': validSignature,
        },
        body: payload,
      })
    );

    expect(resValid.status).toBe(200);
    const bodyValid = await resValid.json();
    expect(bodyValid.verified).toBe(true);
    expect(bodyValid.event).toBe('charge.succeeded');

    // 2. Tampered Payload with same signature -> 401 Unauthorized
    const tamperedPayload = JSON.stringify({ event: 'charge.succeeded', amount: 999999 });
    const resTampered = await app.handle(
      new Request('http://localhost:3000/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature-256': validSignature,
        },
        body: tamperedPayload,
      })
    );

    expect(resTampered.status).toBe(401);

    // 3. Forged Signature -> 401 Unauthorized
    const resForged = await app.handle(
      new Request('http://localhost:3000/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature-256': 'badf00d1234567890abcdef',
        },
        body: payload,
      })
    );

    expect(resForged.status).toBe(401);
  });

  it('supports GitHub (sha256=...) and auto-detected header prefixes', async () => {
    const app = createApp();
    const router = createRouter();
    const secret = 'github-webhook-secret';

    router.post('/webhooks/github', async (ctx) => {
      // Header omitted: auto-detects 'x-hub-signature-256'
      const isValid = await ctx.webhook.verifyHMAC({ secret });

      if (!isValid) {
        return ctx.forbidden('Webhook signature mismatch');
      }

      return ctx.ok({ processed: true });
    });

    app.use(router);

    const payload = JSON.stringify({ action: 'opened', repository: { name: 'API-FIRE' } });
    const hexDigest = await computeHMAC(payload, secret, 'SHA-256');

    // GitHub sends header with prefix 'sha256='
    const res = await app.handle(
      new Request('http://localhost:3000/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${hexDigest}`,
        },
        body: payload,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(true);
  });
});
