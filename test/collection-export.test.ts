import { describe, expect, it } from 'bun:test';
import { createApp, createRouter, s } from '../src/index';

describe('FireAPI One-Click Postman & Bruno Collection Exporter', () => {
  it('serves Postman Collection v2.1.0 specification at /docs/collection.json', async () => {
    const app = createApp({
      docs: '/docs',
      openapiPath: '/openapi.json',
    });

    const router = createRouter('/articles');
    router.get('/', {
      ai: { description: 'Get all articles' },
      handler: (ctx) => ctx.ok([]),
    });

    router.post('/', {
      schema: {
        body: s.object({
          title: s.string().min(5),
          content: s.string().min(10),
        }),
      },
      ai: { description: 'Create an article' },
      handler: (ctx) => ctx.created(ctx.body),
    });

    app.use(router);

    const res = await app.handle(new Request('http://localhost:3000/docs/collection.json'));
    expect(res.status).toBe(200);

    const collection = await res.json();
    expect(collection.info.schema).toContain('v2.1.0');
    expect(Array.isArray(collection.item)).toBe(true);

    const getArticle = collection.item.find((i: any) => i.name === 'GET /articles');
    expect(getArticle).toBeDefined();
    expect(getArticle.request.method).toBe('GET');

    const postArticle = collection.item.find((i: any) => i.name === 'POST /articles');
    expect(postArticle).toBeDefined();
    expect(postArticle.request.method).toBe('POST');
    expect(postArticle.request.body).toBeDefined();
    expect(postArticle.request.body.mode).toBe('raw');

    // Parse the auto-generated mock body inside the collection!
    const mockPayload = JSON.parse(postArticle.request.body.raw);
    expect(typeof mockPayload.title).toBe('string');
    expect(typeof mockPayload.content).toBe('string');
  });
});
