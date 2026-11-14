import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Atomic Transaction Scope (ctx.db.tx)', () => {
  it('commits multi-table operations atomically when transaction succeeds', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const router = createRouter();

    router.post('/checkout', async (ctx) => {
      const result = await ctx.db.tx(async (trx) => {
        const user = await trx.users.insert({ name: 'Alice', balance: 500 });
        const order = await trx.orders.insert({ userId: user.id, total: 150 });
        const log = await trx.audit_logs.insert({ action: 'CHECKOUT_SUCCESS', orderId: order.id });
        return { user, order, log };
      });

      return ctx.created(result);
    });

    app.use(router);

    const res = await app.handle(
      new Request('http://localhost:3000/checkout', { method: 'POST' })
    );

    expect(res.status).toBe(201);

    // Verify all records were committed
    const users = await app.db.users.find();
    const orders = await app.db.orders.find();
    const logs = await app.db.audit_logs.find();

    expect(users.length).toBe(1);
    expect(orders.length).toBe(1);
    expect(logs.length).toBe(1);
    expect(users[0].name).toBe('Alice');
    expect(orders[0].total).toBe(150);
  });

  it('automatically rolls back all multi-table changes when transaction callback throws', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const router = createRouter();

    // Pre-populate with initial user
    await app.db.users.insert({ id: 'existing_user', name: 'Bob', balance: 1000 });

    router.post('/transfer-fail', async (ctx) => {
      try {
        await ctx.db.tx(async (trx) => {
          // 1. Deduct balance from existing user
          await trx.users.update('existing_user', { balance: 800 });

          // 2. Insert new recipient user
          await trx.users.insert({ id: 'new_recipient', name: 'Charlie', balance: 200 });

          // 3. Insert transaction record
          await trx.transfers.insert({ from: 'existing_user', to: 'new_recipient', amount: 200 });

          // 4. Simulate a failure (e.g. external network error or validation failure)
          throw new Error('Anti-fraud check triggered: transfer rejected');
        });
      } catch (err: any) {
        return ctx.badRequest({ message: err.message });
      }

      return ctx.ok({ success: true });
    });

    app.use(router);

    const res = await app.handle(
      new Request('http://localhost:3000/transfer-fail', { method: 'POST' })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('Anti-fraud check triggered');

    // VERIFY AUTO-ROLLBACK:
    // 1. Existing user balance must still be 1000 (NOT 800)
    const existingUser = await app.db.users.findById('existing_user');
    expect(existingUser.balance).toBe(1000);

    // 2. New recipient must NOT exist
    const recipient = await app.db.users.findById('new_recipient');
    expect(recipient).toBeNull();

    // 3. Transfers table must have 0 rows
    const transfers = await app.db.transfers.find();
    expect(transfers.length).toBe(0);
  });
});
