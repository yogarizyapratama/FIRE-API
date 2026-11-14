import { Router } from '../core/router';
import { createContext } from '../core/context';
import { BaseSchema } from '../schema/schema';

export interface MCPToolManifest {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface MCPServerOptions {
  name?: string;
  version?: string;
}

export function routeToToolName(method: string, path: string): string {
  const clean = path
    .replace(/^\//, '')
    .replace(/:([a-zA-Z0-9_]+)/g, '$1')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
  return `${method.toLowerCase()}_${clean || 'root'}`;
}

export class MCPServer {
  constructor(private router: Router, private options: MCPServerOptions = {}) {}

  public listTools(): MCPToolManifest[] {
    const tools: MCPToolManifest[] = [];

    for (const route of this.router.routesList) {
      if (!route.options.ai) continue;

      const toolName = route.options.ai.operationId || routeToToolName(route.method, route.path);
      const schema = route.options.schema;

      let inputSchema: Record<string, any> = { type: 'object', properties: {} };

      if (schema?.body && schema.body instanceof BaseSchema) {
        inputSchema = schema.body.toOpenAPI();
      } else if (schema?.params && schema.params instanceof BaseSchema) {
        inputSchema = schema.params.toOpenAPI();
      } else if (schema?.query && schema.query instanceof BaseSchema) {
        inputSchema = schema.query.toOpenAPI();
      }

      tools.push({
        name: toolName,
        description: route.options.ai.description || `${route.method} ${route.path}`,
        inputSchema,
      });
    }

    return tools;
  }

  public async callTool(name: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    for (const route of this.router.routesList) {
      if (!route.options.ai) continue;
      const toolName = route.options.ai.operationId || routeToToolName(route.method, route.path);

      if (toolName === name) {
        try {
          // Construct simulated request and context
          const req = new Request(`http://localhost${route.path}`, {
            method: route.method,
            headers: { 'Content-Type': 'application/json' },
            body: route.method !== 'GET' && route.method !== 'HEAD' ? JSON.stringify(args) : undefined,
          });

          const ctx = createContext({
            req,
            params: args,
            body: args,
          });

          const res = await route.options.handler(ctx);
          let outputText = '';

          if (res instanceof Response) {
            outputText = await res.text();
          } else {
            outputText = typeof res === 'string' ? res : JSON.stringify(res);
          }

          return {
            content: [{ type: 'text', text: outputText }],
            isError: false,
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: err?.message || 'Error executing tool' }],
            isError: true,
          };
        }
      }
    }

    return {
      content: [{ type: 'text', text: `Tool not found: ${name}` }],
      isError: true,
    };
  }

  public handleMCPProtocol(message: { method: string; params?: any; id?: any }): Promise<any> {
    const { method, params, id } = message;

    if (method === 'tools/list') {
      return Promise.resolve({
        jsonrpc: '2.0',
        id,
        result: { tools: this.listTools() },
      });
    }

    if (method === 'tools/call') {
      return this.callTool(params?.name, params?.arguments).then((res) => ({
        jsonrpc: '2.0',
        id,
        result: res,
      }));
    }

    return Promise.resolve({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    });
  }
}

export function createMCPServer(router: Router, options: MCPServerOptions = {}): MCPServer {
  return new MCPServer(router, options);
}
