import { describe, expect, it } from 'bun:test';
import { Router } from '../src/core/router';
import { s } from '../src/schema/schema';
import { generateOpenAPISpec } from '../src/schema/openapi';
import { renderScalarDocsHTML } from '../src/docs/scalar-ui';

describe('FireAPI OpenAPI 3.1 & Scalar Documentation Engine', () => {
  it('generates compliant OpenAPI 3.1 specification from routes and schemas', () => {
    const router = new Router();

    router.post('/users', {
      ai: { description: 'Create user' },
      schema: {
        body: s.object({
          name: s.string().min(2),
          email: s.string().email(),
        }),
      },
      handler: (ctx) => ctx.created({}),
    });

    const spec = generateOpenAPISpec(router, {
      title: 'Test FireAPI',
      version: '1.0.0',
    });

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Test FireAPI');
    expect(spec.paths['/users']).toBeDefined();
    expect(spec.paths['/users'].post).toBeDefined();
    expect(spec.paths['/users'].post.requestBody.content['application/json'].schema.type).toBe('object');
  });

  it('renders modern Scalar interactive documentation HTML', () => {
    const html = renderScalarDocsHTML('/openapi.json', 'My Fire API Docs');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@scalar/api-reference');
    expect(html).toContain('/openapi.json');
    expect(html).toContain('My Fire API Docs');
  });
});
