import { describe, expect, it } from 'bun:test';
import { Router } from '../src/core/router';
import { s } from '../src/schema/schema';
import { createMCPServer } from '../src/ai/mcp';

describe('FireAPI FireAI & Model Context Protocol (MCP) Adapter', () => {
  it('discovers all routes flagged with ai metadata and builds MCP tool manifests', () => {
    const router = new Router();

    router.get('/users/:id', {
      ai: { description: 'Fetch user account profile by unique ID' },
      schema: {
        params: s.object({ id: s.string().min(1) }),
      },
      handler: (ctx) => ctx.ok({ id: ctx.params.id, name: 'Alice' }),
    });

    router.post('/users', {
      ai: { description: 'Create a new user account' },
      schema: {
        body: s.object({
          name: s.string(),
          email: s.string().email(),
        }),
      },
      handler: (ctx) => ctx.created({ id: 'new_user', ...ctx.body }),
    });

    const mcp = createMCPServer(router, { name: 'UserServer', version: '1.0.0' });
    const tools = mcp.listTools();

    expect(tools.length).toBe(2);
    expect(tools[0].name).toBe('get_users_id');
    expect(tools[0].description).toBe('Fetch user account profile by unique ID');
    expect(tools[0].inputSchema.type).toBe('object');
    expect(tools[1].name).toBe('post_users');
    expect(tools[1].inputSchema.properties.name).toBeDefined();
  });

  it('executes tool calls via callTool and invokes the route handler cleanly', async () => {
    const router = new Router();
    router.post('/calc/add', {
      ai: { description: 'Add two numbers' },
      schema: {
        body: s.object({
          a: s.number(),
          b: s.number(),
        }),
      },
      handler: (ctx) => ctx.ok({ result: ctx.body.a + ctx.body.b }),
    });

    const mcp = createMCPServer(router);
    const result = await mcp.callTool('post_calc_add', { a: 15, b: 27 });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.result).toBe(42);
  });
});
