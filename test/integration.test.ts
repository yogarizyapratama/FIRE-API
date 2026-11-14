import { describe, expect, it } from 'bun:test';
import { createApp, createRouter, s, createClient } from '../src/index';

describe('FireAPI End-to-End Integration Suite', () => {
  it('powers a complete production API lifecycle with DB, Security, Validation, and Client', async () => {
    const app = createApp({
      database: { driver: 'memory' },
      security: {
        rateLimit: { max: 100, window: '1m' },
        cors: true,
      },
      docs: '/docs',
      openapiPath: '/openapi.json',
    });

    const UserSchema = s.object({
      name: s.string().min(2),
      email: s.string().email(),
      role: s.enum(['admin', 'member']).default('member'),
    });

    const userRouter = createRouter('/users');

    userRouter.post('/', {
      schema: { body: UserSchema },
      ai: { description: 'Register a new user' },
      handler: async (ctx) => {
        const created = await ctx.db.table('users').insert(ctx.body);
        return ctx.created(created);
      },
    });

    userRouter.get('/:id', {
      schema: { params: s.object({ id: s.string().min(1) }) },
      cache: { ttl: 30, tags: ['users'] },
      ai: { description: 'Get user by unique ID' },
      handler: async (ctx) => {
        const user = await ctx.db.table('users').findById(ctx.params.id);
        if (!user) return ctx.notFound('User not found');
        return ctx.ok(user);
      },
    });

    app.use(userRouter);
    app.enableMCP({ name: 'IntegrationMCP' });

    // 1. Create client bound to app.handle directly
    const client = createClient('http://localhost:3000', {
      fetch: (url, init) => {
        const req = new Request(url, init);
        return app.handle(req);
      },
    });

    // 2. Test POST /users (Success)
    const postRes = await client.users.post({
      body: { name: 'Yoga Developer', email: 'yoga@fire.dev' },
    });
    expect(postRes.status).toBe(201);
    expect(postRes.data.id).toBeDefined();
    expect(postRes.data.name).toBe('Yoga Developer');
    expect(postRes.data.role).toBe('member');
    expect(postRes.headers.get('x-response-time')).toBeDefined();
    expect(postRes.headers.get('x-content-type-options')).toBe('nosniff');

    const createdId = postRes.data.id;

    // 3. Test POST /users (Validation failure)
    const badRes = await client.users.post({
      body: { name: 'Y', email: 'invalid-email' },
    });
    expect(badRes.status).toBe(400);
    expect(badRes.data.error).toBe('Bad Request');

    // 4. Test GET /users/:id (Success)
    const getRes = await client.users[':id'].get({ params: { id: createdId } });
    expect(getRes.status).toBe(200);
    expect(getRes.data.email).toBe('yoga@fire.dev');

    // 5. Test OpenAPI Spec generation
    const specReq = new Request('http://localhost:3000/openapi.json');
    const specRes = await app.handle(specReq);
    expect(specRes.status).toBe(200);
    const specJson = await specRes.json();
    expect(specJson.openapi).toBe('3.1.0');
    expect(specJson.paths['/users'].post).toBeDefined();

    // 6. Test Scalar Interactive Docs HTML
    const docsReq = new Request('http://localhost:3000/docs');
    const docsRes = await app.handle(docsReq);
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get('content-type')).toContain('text/html');
    const htmlText = await docsRes.text();
    expect(htmlText).toContain('@scalar/api-reference');

    // 7. Test AI / MCP Tool execution endpoint
    const mcpReq = new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/list',
      }),
    });
    const mcpRes = await app.handle(mcpReq);
    expect(mcpRes.status).toBe(200);
    const mcpData = await mcpRes.json();
    expect(mcpData.result.tools.length).toBeGreaterThanOrEqual(2);
  });
});
