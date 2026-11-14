import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Typed In-Process Event Bus (app.on, ctx.emit)', () => {
  it('subscribes to and receives typed events triggered via ctx.emit()', async () => {
    const app = createApp();
    const router = createRouter();

    let eventReceived: any = null;

    app.on('order.paid', async (payload) => {
      eventReceived = payload;
    });

    router.post('/checkout', async (ctx) => {
      await ctx.emit('order.paid', { orderId: 'ORD_999', total: 450 });
      return ctx.ok({ status: 'dispatched' });
    });

    app.use(router);

    const res = await app.handle(
      new Request('http://localhost:3000/checkout', { method: 'POST' })
    );

    expect(res.status).toBe(200);
    expect(eventReceived).not.toBeNull();
    expect(eventReceived.orderId).toBe('ORD_999');
    expect(eventReceived.total).toBe(450);
  });

  it('supports wildcard listeners (e.g. user.*)', async () => {
    const app = createApp();
    const capturedEvents: string[] = [];

    app.on('user.*', async (payload) => {
      capturedEvents.push(payload.action);
    });

    await app.emit('user.registered', { action: 'REGISTER' });
    await app.emit('user.login', { action: 'LOGIN' });
    await app.emit('order.created', { action: 'ORDER' }); // Should NOT match

    expect(capturedEvents).toEqual(['REGISTER', 'LOGIN']);
  });

  it('allows unsubscribing from events cleanly', async () => {
    const app = createApp();
    let callCount = 0;

    const unsubscribe = app.on('ping', () => {
      callCount++;
    });

    await app.emit('ping', {});
    expect(callCount).toBe(1);

    unsubscribe();
    await app.emit('ping', {});
    expect(callCount).toBe(1); // Not called after unsubscribe
  });
});
