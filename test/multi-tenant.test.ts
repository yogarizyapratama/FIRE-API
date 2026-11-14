import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Zero-Ceremony Multi-Tenant SaaS Scoping (ctx.tenant)', () => {
  it('automatically isolates database records per tenant using X-Tenant-ID header', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      multiTenant: {
        header: 'X-Tenant-ID',
        autoScopeDB: true,
      },
    });

    const router = createRouter('/products');

    router.post('/', async (ctx) => {
      const product = await ctx.db.products.insert({ name: ctx.body.name, price: ctx.body.price });
      return ctx.created(product);
    });

    router.get('/', async (ctx) => {
      const products = await ctx.db.products.find();
      return ctx.ok({ tenantId: ctx.tenant?.id, products });
    });

    app.use(router);

    // 1. Tenant Acme inserts a product
    const resAcmeInsert = await app.handle(
      new Request('http://localhost:3000/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'org_acme',
        },
        body: JSON.stringify({ name: 'Acme Anvil', price: 99 }),
      })
    );
    expect(resAcmeInsert.status).toBe(201);

    // 2. Tenant Stark inserts a product
    const resStarkInsert = await app.handle(
      new Request('http://localhost:3000/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'org_stark',
        },
        body: JSON.stringify({ name: 'Arc Reactor', price: 99999 }),
      })
    );
    expect(resStarkInsert.status).toBe(201);

    // 3. Acme queries products -> MUST ONLY see Acme's products!
    const resAcmeGet = await app.handle(
      new Request('http://localhost:3000/products', {
        headers: { 'X-Tenant-ID': 'org_acme' },
      })
    );
    expect(resAcmeGet.status).toBe(200);
    const acmeData = await resAcmeGet.json();
    expect(acmeData.tenantId).toBe('org_acme');
    expect(acmeData.products.length).toBe(1);
    expect(acmeData.products[0].name).toBe('Acme Anvil');
    expect(acmeData.products[0].tenantId).toBe('org_acme');

    // 4. Stark queries products -> MUST ONLY see Stark's products!
    const resStarkGet = await app.handle(
      new Request('http://localhost:3000/products', {
        headers: { 'X-Tenant-ID': 'org_stark' },
      })
    );
    expect(resStarkGet.status).toBe(200);
    const starkData = await resStarkGet.json();
    expect(starkData.tenantId).toBe('org_stark');
    expect(starkData.products.length).toBe(1);
    expect(starkData.products[0].name).toBe('Arc Reactor');
    expect(starkData.products[0].tenantId).toBe('org_stark');
  });
});
