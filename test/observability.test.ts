import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Cloud-Native Observability, Health & Structured Logging', () => {
  it('automatically sets and propagates X-Request-ID across context and headers', async () => {
    const app = createApp();
    const router = createRouter();

    let capturedReqId = '';

    router.get('/trace', (ctx) => {
      capturedReqId = ctx.requestId;
      return ctx.ok({ traceId: ctx.requestId });
    });

    app.use(router);

    // 1. Client provides custom X-Request-ID
    const res1 = await app.handle(
      new Request('http://localhost:3000/trace', {
        headers: { 'X-Request-ID': 'custom-req-123' },
      })
    );

    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-Request-ID')).toBe('custom-req-123');
    expect(capturedReqId).toBe('custom-req-123');

    // 2. Client does not provide header -> auto-generated unique ID
    const res2 = await app.handle(new Request('http://localhost:3000/trace'));
    expect(res2.status).toBe(200);
    const generatedId = res2.headers.get('X-Request-ID');
    expect(generatedId).not.toBeNull();
    expect(generatedId?.startsWith('req_')).toBe(true);
    expect(capturedReqId).toBe(generatedId!);
  });

  it('provides structured JSON logging via ctx.log with automatic reqId context', async () => {
    const app = createApp();
    const router = createRouter();

    const capturedLogs: any[] = [];

    router.get('/log-test', (ctx) => {
      ctx.log.setSink((record: any) => capturedLogs.push(record));
      ctx.log.info('Processing order', { amount: 250, currency: 'USD' });
      ctx.log.warn('Inventory low', { sku: 'SKU-001' });
      return ctx.ok({ logged: true });
    });

    app.use(router);

    const res = await app.handle(
      new Request('http://localhost:3000/log-test', {
        headers: { 'X-Request-ID': 'req-logger-99' },
      })
    );

    expect(res.status).toBe(200);
    expect(capturedLogs.length).toBe(2);

    expect(capturedLogs[0].level).toBe('info');
    expect(capturedLogs[0].msg).toBe('Processing order');
    expect(capturedLogs[0].reqId).toBe('req-logger-99');
    expect(capturedLogs[0].amount).toBe(250);

    expect(capturedLogs[1].level).toBe('warn');
    expect(capturedLogs[1].msg).toBe('Inventory low');
  });

  it('serves liveness (/healthz) and readiness (/readyz) probes automatically', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      health: {
        livenessPath: '/healthz',
        readinessPath: '/readyz',
        checkDatabase: true,
      },
    });

    // 1. Test /healthz
    const livenessRes = await app.handle(new Request('http://localhost:3000/healthz'));
    expect(livenessRes.status).toBe(200);
    const livenessBody = await livenessRes.json();
    expect(livenessBody.status).toBe('ok');
    expect(typeof livenessBody.timestamp).toBe('number');

    // 2. Test /readyz
    const readinessRes = await app.handle(new Request('http://localhost:3000/readyz'));
    expect(readinessRes.status).toBe(200);
    const readinessBody = await readinessRes.json();
    expect(readinessBody.status).toBe('ok');
    expect(readinessBody.checks.database).toBe('ok');
  });
});
