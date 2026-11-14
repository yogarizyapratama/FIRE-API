import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Idempotency Shield (X-Idempotency-Key)', () => {
  it('deduplicates requests and returns identical cached response without re-executing handler', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    let executionCount = 0;

    const orderRouter = createRouter('/orders');
    orderRouter.post('/checkout', {
      idempotent: true,
      handler: async (ctx) => {
        executionCount++;
        const order = await ctx.db.orders.insert({
          total: ctx.body.total,
          orderNumber: `ORD-${Date.now()}-${executionCount}`,
        });
        return ctx.created(order);
      },
    });

    app.use(orderRouter);

    const idempotencyKey = 'unique-key-xyz-777';

    // 1. First Request
    const res1 = await app.handle(
      new Request('http://localhost:3000/orders/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ total: 100 }),
      })
    );

    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(executionCount).toBe(1);
    expect(data1.total).toBe(100);

    // 2. Second Request (Identical X-Idempotency-Key) - Must NOT re-execute handler!
    const res2 = await app.handle(
      new Request('http://localhost:3000/orders/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ total: 100 }),
      })
    );

    expect(res2.status).toBe(201);
    const data2 = await res2.json();
    expect(executionCount).toBe(1); // Handler was NOT run again!
    expect(data2.orderNumber).toBe(data1.orderNumber); // Identical response payload!
    expect(res2.headers.get('X-Idempotent-Replay')).toBe('true');

    // Verify only 1 order exists in database
    const ordersInDb = await app.db.orders.find();
    expect(ordersInDb.length).toBe(1);
  });
});
