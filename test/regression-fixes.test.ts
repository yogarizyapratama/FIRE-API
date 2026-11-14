import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';
import { createDatabaseHub } from '../src/db/hub';

describe('FireAPI Security & Correctness Regression Fixes', () => {
  it('blocks tenant spoofing on insert (body cannot override scoped tenantId)', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      multiTenant: { header: 'X-Tenant-ID' },
    });

    const router = createRouter('/products');
    router.post('/', async (ctx) => ctx.created(await ctx.db.products.insert(ctx.body)));
    app.use(router);

    await app.handle(
      new Request('http://localhost:3000/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'org_acme',
        },
        body: JSON.stringify({ name: 'Anvil', tenantId: 'org_malicious' }),
      })
    );

    const rows = await app.db.products.find();
    expect(rows.length).toBe(1);
    expect(rows[0].tenantId).toBe('org_acme');
  });

  it('requires a tenant identifier when multiTenant is enabled', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      multiTenant: { header: 'X-Tenant-ID' },
    });

    const router = createRouter('/reports');
    router.get('/', (ctx) => ctx.ok({ tenant: ctx.tenant?.id }));
    app.use(router);

    const res = await app.handle(new Request('http://localhost:3000/reports'));
    expect(res.status).toBe(400);
  });

  it('allows tenant-less access only when multiTenant.require is false', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      multiTenant: { header: 'X-Tenant-ID', require: false },
    });

    const router = createRouter('/reports');
    router.get('/', (ctx) => ctx.ok({ tenant: ctx.tenant?.id }));
    app.use(router);

    const res = await app.handle(new Request('http://localhost:3000/reports'));
    expect(res.status).toBe(200);
  });

  it('isolates route cache per tenant', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      multiTenant: { header: 'X-Tenant-ID', require: true },
    });

    const router = createRouter('/reports');
    router.get('/summary', {
      cache: { ttl: 60 },
      handler: (ctx) => ctx.ok({ tenant: ctx.tenant?.id }),
    });
    app.use(router);

    const resA1 = await app.handle(
      new Request('http://localhost:3000/reports/summary', { headers: { 'X-Tenant-ID': 'org_a' } })
    );
    const resB = await app.handle(
      new Request('http://localhost:3000/reports/summary', { headers: { 'X-Tenant-ID': 'org_b' } })
    );
    const resA2 = await app.handle(
      new Request('http://localhost:3000/reports/summary', { headers: { 'X-Tenant-ID': 'org_a' } })
    );

    expect((await resA1.json()).tenant).toBe('org_a');
    expect((await resB.json()).tenant).toBe('org_b');
    expect((await resA2.json()).tenant).toBe('org_a');
    expect(resA2.headers.get('X-Cache')).toBe('HIT');
  });

  it('persists ORM data through the SQLite driver', async () => {
    const db = createDatabaseHub({ driver: 'sqlite' });

    const inserted = await db.table('users').insert({ name: 'Yoga', email: 'yoga@fire.dev' });
    expect(inserted.id).toBeDefined();

    // Row must actually live in SQLite, not only the in-memory fallback
    const raw = await db.raw('SELECT * FROM "users"');
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBe(1);

    const found = await db.table('users').findOne({ email: 'yoga@fire.dev' });
    expect(found?.name).toBe('Yoga');

    const updated = await db.table('users').where('id', inserted.id).update({ name: 'Yoga R' });
    expect(updated.name).toBe('Yoga R');

    const deleted = await db.table('users').where('id', inserted.id).delete();
    expect(deleted.count).toBe(1);
    expect(await db.table('users').find()).toEqual([]);
  });

  it('throws a clear error for unimplemented drivers instead of silently using memory', () => {
    expect(() => createDatabaseHub({ driver: 'postgres' })).toThrow(/not implemented/);
    expect(() => createDatabaseHub({ driver: 'mysql' })).toThrow(/not implemented/);
  });

  it('rate limits per-IP only when trustProxy is enabled', async () => {
    const trusted = createApp({
      database: { driver: 'memory' },
      security: { rateLimit: { max: 2, window: '1m' }, trustProxy: true },
    });
    const trustedRouter = createRouter('/a');
    trustedRouter.get('/', (ctx) => ctx.ok('ok'));
    trusted.use(trustedRouter);

    const mk = (ip: string) =>
      new Request('http://localhost:3000/a', { headers: { 'x-forwarded-for': ip } });

    expect((await trusted.handle(mk('1.1.1.1'))).status).toBe(200);
    expect((await trusted.handle(mk('1.1.1.1'))).status).toBe(200);
    expect((await trusted.handle(mk('1.1.1.1'))).status).toBe(429);
    // A different (spoofed) IP gets its own bucket when trustProxy is on
    expect((await trusted.handle(mk('2.2.2.2'))).status).toBe(200);
  });

  it('ignores x-forwarded-for by default so spoofed IPs share one bucket', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      security: { rateLimit: { max: 2, window: '1m' } },
    });
    const router = createRouter('/b');
    router.get('/', (ctx) => ctx.ok('ok'));
    app.use(router);

    const mk = (ip: string) =>
      new Request('http://localhost:3000/b', { headers: { 'x-forwarded-for': ip } });

    expect((await app.handle(mk('1.1.1.1'))).status).toBe(200);
    expect((await app.handle(mk('2.2.2.2'))).status).toBe(200);
    expect((await app.handle(mk('3.3.3.3'))).status).toBe(429);
  });

  it('releases the idempotency key when the first attempt fails validation', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const router = createRouter('/orders');
    router.post('/checkout', {
      idempotent: true,
      handler: async (ctx) => ctx.created(await ctx.db.orders.insert({ total: ctx.body.total })),
    });
    app.use(router);

    // First attempt: malformed JSON -> 400 (key must NOT stay stuck "processing")
    const res1 = await app.handle(
      new Request('http://localhost:3000/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'k-1' },
        body: '{invalid',
      })
    );
    expect(res1.status).toBe(400);

    // Second attempt with same key: must succeed, not 409
    const res2 = await app.handle(
      new Request('http://localhost:3000/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'k-1' },
        body: JSON.stringify({ total: 100 }),
      })
    );
    expect(res2.status).toBe(201);
  });

  it('does not pollute prototypes via multipart field names', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const router = createRouter('/upload');
    router.post('/', (ctx) =>
      ctx.ok({
        isNullProto: Object.getPrototypeOf(ctx.body) === null,
        hasProtoKey: '__proto__' in ctx.body,
      })
    );
    app.use(router);

    const form = new FormData();
    form.append('__proto__', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
    form.append('name', 'legit');

    const res = await app.handle(
      new Request('http://localhost:3000/upload', { method: 'POST', body: form })
    );

    const body = await res.json();
    expect(body.isNullProto).toBe(true);
    expect(body.hasProtoKey).toBe(false);
    expect((Object.prototype as any).isAdmin).toBeUndefined();
  });
});
