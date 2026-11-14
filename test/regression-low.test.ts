import { describe, expect, it, afterAll } from 'bun:test';
import { createApp, createRouter, MemoryDatabase } from '../src/index';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('FireAPI LOW-severity regression fixes', () => {
  // #10 decodeURIComponent must not throw a 500
  it('does not crash on malformed percent-encoding in route params', async () => {
    const app = createApp();
    app.get('/files/:name', { handler: (ctx) => ctx.ok({ name: ctx.params.name }) });

    const res = await app.handle(new Request('http://localhost/files/%zz'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('%zz');
  });

  // #11 CORS `*` + credentials must echo the origin, not a wildcard
  it('echoes origin instead of `*` when CORS credentials are enabled', async () => {
    const app = createApp({ security: { cors: { credentials: true } } });
    app.get('/data', { handler: (ctx) => ctx.ok({ ok: true }) });

    const res = await app.handle(
      new Request('http://localhost/data', { headers: { Origin: 'https://app.example.com' } })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const pre = await app.handle(
      new Request('http://localhost/data', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      })
    );
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  it('keeps `*` origin when credentials are not enabled', async () => {
    const app = createApp();
    app.get('/public', { handler: (ctx) => ctx.ok({ ok: true }) });

    const res = await app.handle(
      new Request('http://localhost/public', { headers: { Origin: 'https://other.example.com' } })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  // #12 serveStatic must not escape the served directory
  it('blocks path traversal in serveStatic', async () => {
    const dir = path.join(os.tmpdir(), `fire-static-${Date.now()}`);
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<h1>ok</h1>');
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'TOP SECRET');

    const app = createApp();
    app.serveStatic('/assets', path.join(dir, 'public'));

    const ok = await app.handle(new Request('http://localhost/assets/index.html'));
    expect(ok.status).toBe(200);

    // Encoded traversal must be contained
    const bad = await app.handle(new Request('http://localhost/assets/..%2Fsecret.txt'));
    expect(bad.status).toBe(404);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  // #14 router prefix boundaries must not swallow partial prefixes
  it('respects path-prefix boundaries (no partial-prefix swallow)', async () => {
    const api = createRouter('/api');
    api.get('/apix', { handler: (ctx) => ctx.ok({ hit: 'api/apix' }) });

    const app = createApp();
    app.use(api);

    const res = await app.handle(new Request('http://localhost/api/apix'));
    expect(res.status).toBe(200);
    expect((await res.json()).hit).toBe('api/apix');

    const miss = await app.handle(new Request('http://localhost/apix'));
    expect(miss.status).toBe(404);
  });

  // #15 memory insert must not let client data spoof server timestamps
  it('memory insert cannot spoof server timestamps', async () => {
    const db = new MemoryDatabase();
    const fakeTime = '2000-01-01T00:00:00.000Z';

    const inserted = await db.table('users').insert({ name: 'x', createdAt: fakeTime });
    expect(inserted.createdAt).not.toBe(fakeTime);
    expect(inserted.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(inserted.id).toBeDefined();

    const many = await db.table('users').insert([{ name: 'a', createdAt: fakeTime }]);
    expect(many[0].createdAt).not.toBe(fakeTime);

    const custom = await db.table('users').insert({ id: 'my-id', name: 'y' });
    expect(custom.id).toBe('my-id');
  });
});
