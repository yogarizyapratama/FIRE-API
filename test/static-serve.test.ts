import { describe, expect, it, afterAll } from 'bun:test';
import { createApp } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('FireAPI Static Assets & SPA Serving (app.serveStatic, app.serveSPA)', () => {
  const tempDir = path.resolve('./temp_static_test');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'style.css'), 'body { background: #000; }');
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>SPA Root</body></html>');
  }

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('serves static files with correct MIME types and headers', async () => {
    const app = createApp();
    app.serveStatic('/assets', tempDir);

    // 1. Fetch style.css
    const resCss = await app.handle(new Request('http://localhost:3000/assets/style.css'));
    expect(resCss.status).toBe(200);
    expect(resCss.headers.get('Content-Type')).toContain('text/css');
    const textCss = await resCss.text();
    expect(textCss).toBe('body { background: #000; }');

    // 2. Fetch app.js
    const resJs = await app.handle(new Request('http://localhost:3000/assets/app.js'));
    expect(resJs.status).toBe(200);
    expect(resJs.headers.get('Content-Type')).toContain('application/javascript');

    // 3. 404 for non-existent file
    const res404 = await app.handle(new Request('http://localhost:3000/assets/missing.png'));
    expect(res404.status).toBe(404);
  });

  it('serves SPA fallback HTML for client-side routing', async () => {
    const app = createApp();
    app.serveSPA('/app', path.join(tempDir, 'index.html'));

    const res = await app.handle(new Request('http://localhost:3000/app'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const textHtml = await res.text();
    expect(textHtml).toContain('SPA Root');
  });
});
