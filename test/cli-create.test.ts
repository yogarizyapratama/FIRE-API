import { describe, expect, it, afterAll } from 'bun:test';
import { createAppProject, formatRoutesTable, createRouter } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('FireAPI CLI Scaffolding & Developer Accelerator (create-app & routes)', () => {
  const tempProjectDir = path.resolve('./temp_scaffold_test_app');

  afterAll(() => {
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a complete, clean, modern FireAPI project with all files', () => {
    const result = createAppProject({
      name: 'test-saas-api',
      targetDir: tempProjectDir,
    });

    expect(result.filesCreated.length).toBeGreaterThanOrEqual(10);
    expect(fs.existsSync(path.join(tempProjectDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, '.env'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'src/modules/users/users.router.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'src/modules/users/users.schema.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'src/modules/auth/auth.router.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempProjectDir, 'test/app.test.ts'))).toBe(true);

    // Verify package.json contains correct scripts
    const pkg = JSON.parse(fs.readFileSync(path.join(tempProjectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('test-saas-api');
    expect(pkg.scripts.dev).toContain('bun');
    expect(pkg.scripts.compile).toContain('fire-api compile');
    expect(pkg.dependencies['@tamayrp14/fire-api']).toBe('^1.0.3');

    // Generated code must import the real (scoped) package and interpolate the project name
    const indexSrc = fs.readFileSync(path.join(tempProjectDir, 'src/index.ts'), 'utf-8');
    expect(indexSrc).toContain("@tamayrp14/fire-api");
    expect(indexSrc).toContain('test-saas-api');
    expect(indexSrc).not.toContain('${projectName}');

    const authSrc = fs.readFileSync(path.join(tempProjectDir, 'src/modules/auth/auth.router.ts'), 'utf-8');
    expect(authSrc).toContain('tokenExpirySeconds');
    expect(authSrc).not.toContain('tokenExpiresIn');
  });

  it('renders a visual terminal route table via formatRoutesTable()', () => {
    const router = createRouter('/api/v1');

    router.get('/items', {
      cache: { ttl: 60 },
      ai: { description: 'Fetch all catalog items' },
      handler: (ctx) => ctx.ok([]),
    });

    router.post('/items', {
      idempotent: true,
      roles: ['admin', 'manager'],
      ai: { description: 'Create a new catalog item' },
      handler: (ctx) => ctx.created({}),
    });

    const output = formatRoutesTable(router);

    expect(output).toContain('FireAPI Route Manifest');
    expect(output).toContain('GET');
    expect(output).toContain('/api/v1/items');
    expect(output).toContain('POST');
    expect(output).toContain('admin, manager');
    expect(output).toContain('Fetch all catalog items');
  });
});
