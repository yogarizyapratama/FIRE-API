import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';
import { enableStudio } from '../src/studio/studio';

describe('FireAPI FireStudio Embedded Dev Dashboard (fire-api/studio)', () => {
  it('serves the Studio dashboard HTML and overview data', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    
    // Seed some data
    await app.db.table('users').insert({ name: 'Alice', role: 'admin' });
    await app.db.table('posts').insert({ title: 'Welcome to FireAPI' });

    const router = createRouter('/api');
    router.get('/health', { handler: (ctx) => ctx.ok({ status: 'ok' }) });
    app.use(router);

    // Enable studio
    enableStudio(app, { path: '/studio' });

    // 1. Test HTML Dashboard
    const htmlRes = await app.handle(new Request('http://localhost:3000/studio'));
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    const html = await htmlRes.text();
    expect(html).toContain('FireStudio');
    expect(html).toContain('Database Explorer');

    // 2. Test Overview API
    const overviewRes = await app.handle(new Request('http://localhost:3000/studio/api/overview'));
    expect(overviewRes.status).toBe(200);
    const overview = await overviewRes.json();
    expect(overview.tables).toContain('users');
    expect(overview.tables).toContain('posts');
    expect(overview.routesCount).toBeGreaterThan(0);

    // 3. Test Table Data API
    const tableRes = await app.handle(new Request('http://localhost:3000/studio/api/tables/users'));
    expect(tableRes.status).toBe(200);
    const users = await tableRes.json();
    expect(users.length).toBe(1);
    expect(users[0].name).toBe('Alice');
  });
});
