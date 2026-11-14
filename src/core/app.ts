import {
  FireAppOptions,
  FireCacheManager,
  FireDatabase,
  Handler,
  HookType,
  HttpMethod,
  Middleware,
  RouteOptions,
} from '../types';
import { Router } from './router';
import { createContext } from './context';
import { HttpError } from './error';
import { applySecurityHeaders } from '../shield/headers';
import { appendCorsHeaders, handleCORS } from '../shield/cors';
import { RateLimiter } from '../shield/rate-limiter';
import { sanitizePayload } from '../shield/sanitizer';
import { compressResponse } from '../shield/compress';
import { IdempotencyManager } from '../shield/idempotency';
import { createDatabaseHub, createProxyDatabase } from '../db/hub';
import { MemoryCacheManager } from '../cache/cache';
import { generateOpenAPISpec } from '../schema/openapi';
import { renderScalarDocsHTML } from '../docs/scalar-ui';
import { generatePostmanCollection } from '../docs/collection';
import { createStaticFileResponse } from '../static/serve';
import * as path from 'path';
import { createMCPServer, MCPServer } from '../ai/mcp';
import { BaseSchema } from '../schema/schema';
import { FireQueueManager } from '../jobs/queue';
import { FireCronScheduler, CronTask } from '../jobs/cron';
import { WebSocketHub, FireWebSocketHandler } from '../ws/ws';
import { createStorage, FireStorage } from '../storage/storage';
import { MetricsCollector } from '../metrics/metrics';
import { EventBus, EventListener } from '../events/event-bus';
import { UploadedFile } from '../types';

export class FireApp {
  public router: Router;
  public db: FireDatabase;
  public cache: FireCacheManager;
  public queue: FireQueueManager;
  public cronScheduler: FireCronScheduler;
  public wsHub: WebSocketHub;
  public storage: FireStorage;
  public metrics: MetricsCollector;
  public events = new EventBus();
  public wsHandlers: Map<string, FireWebSocketHandler> = new Map();
  public mcpServer?: MCPServer;
  private options: FireAppOptions;
  private rateLimiter?: RateLimiter;
  private idempotencyManager = new IdempotencyManager();
  private globalMiddlewares: Middleware[] = [];
  private hooks: Record<HookType, Array<(arg1: any, arg2?: any) => Promise<any> | any>> = {
    onRequest: [],
    beforeHandle: [],
    afterHandle: [],
    onError: [],
  };

  constructor(options: FireAppOptions = {}) {
    this.options = {
      port: 3000,
      docs: '/docs',
      openapiPath: '/openapi.json',
      metricsPath: '/metrics',
      ...options,
    };

    this.router = new Router(this.options.prefix || '');
    this.db = createDatabaseHub(this.options.database);
    this.cache = new MemoryCacheManager();
    this.queue = new FireQueueManager();
    this.cronScheduler = new FireCronScheduler();
    this.wsHub = new WebSocketHub();
    this.storage = createStorage(this.options.storage);
    this.metrics = new MetricsCollector();

    // Initialize Security Shield
    if (this.options.security?.rateLimit) {
      this.rateLimiter = new RateLimiter(this.options.security.rateLimit);
    } else if (this.options.security?.enabled !== false) {
      // Default rate limit: 1000 requests per minute
      this.rateLimiter = new RateLimiter({ max: 1000, window: '1m' });
    }

    // Auto-mount Docs, OpenAPI, and Metrics endpoints if configured
    this.setupDocumentationRoutes();
    this.setupMetricsRoute();
    this.setupHealthRoutes();
  }

  private setupMetricsRoute(): void {
    const metricsPath = this.options.metricsPath;
    if (metricsPath) {
      this.router.get(metricsPath, {
        handler: (ctx) => {
          const content = this.metrics.formatPrometheus();
          return ctx.text(content, 200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          });
        },
      });
    }
  }

  private setupDocumentationRoutes(): void {
    const openapiPath = this.options.openapiPath;
    const docsPath = this.options.docs;

    if (openapiPath) {
      this.router.get(openapiPath, {
        handler: (ctx) => {
          const spec = generateOpenAPISpec(this.router, {
            title: 'FireAPI Documentation',
            version: '1.0.0',
          });
          return ctx.json(spec);
        },
      });
    }

    if (docsPath && openapiPath) {
      this.router.get(docsPath, {
        handler: (ctx) => {
          const html = renderScalarDocsHTML(openapiPath, 'FireAPI Interactive Docs');
          return ctx.html(html);
        },
      });

      this.router.get('/docs/collection.json', {
        handler: (ctx) => {
          const collection = generatePostmanCollection(this.router, {
            name: 'FireAPI Generated Collection',
          });
          return ctx.json(collection);
        },
      });
    }
  }

  public serveStatic(routePrefix: string, localDirectory: string): this {
    const normalizedPrefix = routePrefix.endsWith('/') ? routePrefix.slice(0, -1) : routePrefix;
    this.router.get(`${normalizedPrefix}/*`, {
      handler: (ctx) => {
        const url = new URL(ctx.req.url);
        const subPath = url.pathname.slice(normalizedPrefix.length).replace(/^\/+/, '');
        const filePath = path.resolve(localDirectory, subPath);
        const res = createStaticFileResponse(filePath);
        if (!res) {
          return ctx.notFound(`File ${subPath} not found`);
        }
        return res;
      },
    });
    return this;
  }

  public serveSPA(routePath: string, htmlFilePath: string): this {
    this.router.get(routePath, {
      handler: (ctx) => {
        const res = createStaticFileResponse(path.resolve(htmlFilePath));
        if (!res) {
          return ctx.notFound('SPA index file not found');
        }
        return res;
      },
    });
    return this;
  }

  private setupHealthRoutes(): void {
    if (this.options.health === false) return;
    const healthConfig = typeof this.options.health === 'object' ? this.options.health : {};
    const livenessPath = healthConfig.livenessPath || '/healthz';
    const readinessPath = healthConfig.readinessPath || '/readyz';

    // Liveness Probe (process is alive)
    this.router.get(livenessPath, {
      handler: (ctx) => {
        return ctx.ok({
          status: 'ok',
          uptime: typeof process !== 'undefined' && process.uptime ? Math.floor(process.uptime()) : 0,
          timestamp: Date.now(),
        });
      },
    });

    // Readiness Probe (DB & storage dependencies ready)
    this.router.get(readinessPath, {
      handler: async (ctx) => {
        const checks: Record<string, 'ok' | 'down'> = {};
        let isHealthy = true;

        if (healthConfig.checkDatabase !== false) {
          try {
            await this.db.raw('SELECT 1');
            checks.database = 'ok';
          } catch {
            checks.database = 'down';
            isHealthy = false;
          }
        }

        if (healthConfig.checkStorage) {
          try {
            await this.storage.exists('healthcheck');
            checks.storage = 'ok';
          } catch {
            checks.storage = 'down';
            isHealthy = false;
          }
        }

        if (healthConfig.customChecks) {
          for (const checkFn of healthConfig.customChecks) {
            try {
              const res = await checkFn();
              checks[res.name] = res.status === 'ok' ? 'ok' : 'down';
              if (res.status === 'down') isHealthy = false;
            } catch {
              isHealthy = false;
            }
          }
        }

        if (!isHealthy) {
          return ctx.json({ status: 'down', checks }, 503);
        }

        return ctx.ok({ status: 'ok', checks });
      },
    });
  }

  public hook(type: HookType, handler: (arg1: any, arg2?: any) => Promise<any> | any): this {
    this.hooks[type].push(handler);
    return this;
  }

  public use(middleware: Middleware): this;
  public use(subRouter: Router): this;
  public use(prefix: string, subRouter: Router): this;
  public use(arg1: string | Middleware | Router, arg2?: Router): this {
    if (typeof arg1 === 'function') {
      this.globalMiddlewares.push(arg1);
      return this;
    }

    if (arg1 instanceof Router) {
      this.router.use('', arg1);
      return this;
    }

    if (typeof arg1 === 'string' && arg2 instanceof Router) {
      this.router.use(arg1, arg2);
      return this;
    }

    return this;
  }

  public cron(expression: string, handler: (app: FireApp) => Promise<void> | void): CronTask {
    return this.cronScheduler.schedule(expression, () => handler(this));
  }

  public ws(path: string, handler: FireWebSocketHandler): this {
    this.wsHandlers.set(path, handler);
    return this;
  }

  public on<T = any>(event: string, listener: EventListener<T>): () => void {
    return this.events.on(event, listener);
  }

  public async emit<T = any>(event: string, payload: T): Promise<void> {
    return this.events.emit(event, payload);
  }

  public get(path: string, optionsOrHandler: RouteOptions | Handler): this {
    this.router.get(path, optionsOrHandler);
    return this;
  }

  public post(path: string, optionsOrHandler: RouteOptions | Handler): this {
    this.router.post(path, optionsOrHandler);
    return this;
  }

  public put(path: string, optionsOrHandler: RouteOptions | Handler): this {
    this.router.put(path, optionsOrHandler);
    return this;
  }

  public patch(path: string, optionsOrHandler: RouteOptions | Handler): this {
    this.router.patch(path, optionsOrHandler);
    return this;
  }

  public delete(path: string, optionsOrHandler: RouteOptions | Handler): this {
    this.router.delete(path, optionsOrHandler);
    return this;
  }

  public enableMCP(options: { name?: string; version?: string; endpoint?: string } = {}): this {
    this.mcpServer = createMCPServer(this.router, options);
    const endpoint = options.endpoint || '/mcp';

    this.router.post(endpoint, {
      handler: async (ctx) => {
        const body = ctx.body;
        if (!body || typeof body !== 'object') {
          return ctx.badRequest('Invalid JSON-RPC request');
        }
        const result = await this.mcpServer!.handleMCPProtocol(body);
        return ctx.json(result);
      },
    });

    return this;
  }

  /**
   * The pure Web Standard fetch handler: (request: Request) => Promise<Response>
   * Runs natively on Bun, Node.js (via adapter), Cloudflare Workers, and Deno!
   */
  public async handle(request: Request, clientIp?: string): Promise<Response> {
    const startTime = performance.now();
    const url = new URL(request.url);

    // 1. CORS Preflight & Checking
    if (this.options.security?.cors !== false) {
      const corsConfig = typeof this.options.security?.cors === 'object' ? this.options.security.cors : {};
      const corsPreflight = handleCORS(request, corsConfig);
      if (corsPreflight) {
        return this.finalizeResponse(corsPreflight, request, startTime);
      }
    }

    // 2. Global Rate Limiter
    if (this.rateLimiter) {
      const limitCheck = this.rateLimiter.check(this.resolveClientIp(request, clientIp));
      if (!limitCheck.allowed) {
        return this.finalizeResponse(
          new HttpError(429, 'Too Many Requests', { retryAfter: limitCheck.retryAfter }).toResponse(),
          request,
          startTime
        );
      }
    }

    // 3. Match Route in Radix Router
    const method = request.method as HttpMethod;
    const match = this.router.match(method, url.pathname);

    if (!match) {
      const notFoundRes = new HttpError(404, `Cannot ${method} ${url.pathname}`).toResponse();
      return this.finalizeResponse(notFoundRes, request, startTime);
    }

    // Check Idempotency Key
    const idempotencyOption = match.routeOptions.idempotent;
    const idempotencyKey = idempotencyOption
      ? (request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key'))
      : null;

    if (idempotencyKey) {
      const cached = this.idempotencyManager.get(idempotencyKey);
      if (cached) {
        const replayRes = this.idempotencyManager.createResponse(cached);
        return this.finalizeResponse(replayRes, request, startTime);
      }

      if (this.idempotencyManager.isProcessing(idempotencyKey)) {
        return this.finalizeResponse(
          new HttpError(409, 'A request with this Idempotency-Key is currently being processed').toResponse(),
          request,
          startTime
        );
      }

      this.idempotencyManager.markProcessing(idempotencyKey);
    }

    try {
      // 4. Parse & Sanitize Request Body (if any)
      let parsedBody: any = null;
      let rawBody = '';
      const uploadedFiles: Record<string, UploadedFile> = {};

      if (method !== 'GET' && method !== 'HEAD' && request.body) {
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
          try {
            const formData = await request.formData();
            parsedBody = Object.create(null);
            formData.forEach((value, key) => {
              if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
              if (typeof value === 'object' && value !== null && 'arrayBuffer' in value) {
                const fileBlob = value as Blob & { name?: string };
                const fileName = fileBlob.name || 'upload.bin';
                const uploadedFile: UploadedFile = {
                  name: fileName,
                  size: fileBlob.size,
                  type: fileBlob.type || 'application/octet-stream',
                  bytes: async () => new Uint8Array(await fileBlob.arrayBuffer()),
                  text: async () => fileBlob.text(),
                  store: async (destinationDir = 'uploads', opts = {}) => {
                    const destName = opts.fileName || `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const targetPath = destinationDir ? `${destinationDir}/${destName}` : destName;
                    const content = new Uint8Array(await fileBlob.arrayBuffer());
                    return this.storage.put(targetPath, content, { contentType: fileBlob.type });
                  },
                };
                uploadedFiles[key] = uploadedFile;
                parsedBody[key] = uploadedFile;
              } else {
                parsedBody[key] = value;
              }
            });
          } catch {
            return this.finalizeResponse(
              new HttpError(400, 'Malformed multipart form data in request').toResponse(),
              request,
              startTime
            );
          }
        } else {
          try {
            rawBody = await request.text();
            if (contentType.includes('application/json') && rawBody.trim()) {
              const rawJson = JSON.parse(rawBody);
              // Prototype Pollution Guard
              parsedBody = this.options.security?.prototypePollutionGuard !== false
                ? sanitizePayload(rawJson)
                : rawJson;
            } else {
              parsedBody = rawBody;
            }
          } catch {
            return this.finalizeResponse(
              new HttpError(400, 'Malformed JSON in request body').toResponse(),
              request,
              startTime
            );
          }
        }
      }

      // 5. Schema Validation (Params, Query, Body)
      const schema = match.routeOptions.schema;
      if (schema) {
        // Body validation
        if (schema.body && schema.body instanceof BaseSchema) {
          const bodyVal = schema.body.validate(parsedBody);
          if (!bodyVal.success) {
            return this.finalizeResponse(
              new HttpError(400, 'Validation Error', bodyVal.errors).toResponse(),
              request,
              startTime
            );
          }
          parsedBody = bodyVal.data;
        }

        // Params validation
        if (schema.params && schema.params instanceof BaseSchema) {
          const paramsVal = schema.params.validate(match.params);
          if (!paramsVal.success) {
            return this.finalizeResponse(
              new HttpError(400, 'Invalid Path Parameters', paramsVal.errors).toResponse(),
              request,
              startTime
            );
          }
          match.params = paramsVal.data;
        }
      }

      // Multi-Tenant Context Resolution
      let tenantObj: { id: string } | undefined;
      let effectiveDb = this.db;
      if (this.options.multiTenant) {
        const headerName = this.options.multiTenant.header || 'x-tenant-id';
        const queryName = this.options.multiTenant.query || 'tenant';
        const tenantId = request.headers.get(headerName) || url.searchParams.get(queryName);
        if (!tenantId && this.options.multiTenant.require !== false) {
          return this.finalizeResponse(
            new HttpError(400, `Missing tenant identifier. Provide "${headerName}" header or "${queryName}" query parameter.`).toResponse(),
            request,
            startTime
          );
        }
        if (tenantId) {
          tenantObj = { id: tenantId };
          if (this.options.multiTenant.autoScopeDB !== false) {
            effectiveDb = createProxyDatabase(this.db, { tenantId });
          }
        }
      }

      // 6. Construct FireContext
      const ctx = createContext({
        req: request,
        params: match.params,
        db: effectiveDb,
        cache: this.cache,
        queue: this.queue,
        storage: this.storage,
        body: parsedBody,
        files: uploadedFiles,
        rawBody,
        tenant: tenantObj,
        emit: (event, payload) => this.events.emit(event, payload),
      });

      // Lifecycle Hook: onRequest
      for (const hook of this.hooks.onRequest) {
        const hookRes = await hook(ctx);
        if (hookRes instanceof Response) {
          return this.finalizeResponse(hookRes, request, startTime, ctx.requestId);
        }
      }

      // 7. Check Route Cache
      const cacheRule = match.routeOptions.cache;
      let cacheKey = '';
      if (method === 'GET' && cacheRule) {
        const tenantKey = tenantObj?.id || '';
        const userKey = ctx.user?.id != null ? String(ctx.user.id) : '';
        cacheKey = `route:${url.pathname}${url.search}:tenant=${tenantKey}:user=${userKey}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          const cachedRes = ctx.json(cached);
          cachedRes.headers.set('X-Cache', 'HIT');
          return this.finalizeResponse(cachedRes, request, startTime, ctx.requestId);
        }
      }

      // 8. Execute Middleware Chain & Handler
      const middlewares = [...this.globalMiddlewares, ...match.middlewares];
      let currentIdx = 0;

      const next = async (): Promise<Response> => {
        if (currentIdx < middlewares.length) {
          const mw = middlewares[currentIdx++];
          return mw(ctx, next);
        }

        // Lifecycle Hook: beforeHandle
        for (const hook of this.hooks.beforeHandle) {
          const hookRes = await hook(ctx);
          if (hookRes instanceof Response) {
            return hookRes;
          }
        }

        // Check role requirements (RBAC)
        if (match.routeOptions.roles && match.routeOptions.roles.length > 0) {
          const userRole = ctx.user?.role;
          const userRoles = Array.isArray(ctx.user?.roles) ? ctx.user.roles : (userRole ? [userRole] : []);
          const hasRole = match.routeOptions.roles.some((r) => userRoles.includes(r));
          if (!hasRole) {
            return ctx.forbidden('Insufficient permissions');
          }
        }

        // Check dynamic policy gate
        if (match.routeOptions.can) {
          const isAllowed = await match.routeOptions.can(ctx.user, ctx);
          if (!isAllowed) {
            return ctx.forbidden('Access denied by policy gate');
          }
        }

        // Call final handler
        const handlerResult = await match.handler(ctx);
        if (handlerResult instanceof Response) {
          return handlerResult;
        }
        if (typeof handlerResult === 'string') {
          return ctx.text(handlerResult);
        }
        return ctx.ok(handlerResult);
      };

      let resultResponse = await next();

      // Lifecycle Hook: afterHandle
      for (const hook of this.hooks.afterHandle) {
        const modified = await hook(ctx, resultResponse);
        if (modified instanceof Response) {
          resultResponse = modified;
        }
      }

      // If caching enabled for this route, store payload
      if (method === 'GET' && cacheRule && resultResponse.ok) {
        try {
          const cloned = resultResponse.clone();
          const json = await cloned.json();
          const ttlSecs = typeof cacheRule.ttl === 'number' ? cacheRule.ttl : 60;
          await this.cache.set(cacheKey, json, ttlSecs, cacheRule.tags || []);
        } catch {}
      }

      // If idempotency enabled and key provided, cache response
      if (idempotencyKey && resultResponse.ok) {
        const ttl = typeof idempotencyOption === 'object' && idempotencyOption.ttl ? idempotencyOption.ttl : 86400;
        await this.idempotencyManager.storeResponse(idempotencyKey, resultResponse, ttl);
      } else if (idempotencyKey) {
        this.idempotencyManager.release(idempotencyKey);
      }

      return this.finalizeResponse(resultResponse, request, startTime, ctx.requestId);
    } catch (err: any) {
      for (const hook of this.hooks.onError) {
        try {
          await hook(err);
        } catch {}
      }
      if (err instanceof HttpError) {
        return this.finalizeResponse(err.toResponse(), request, startTime);
      }
      const internalRes = new HttpError(500, err?.message || 'Internal Server Error').toResponse();
      return this.finalizeResponse(internalRes, request, startTime);
    } finally {
      if (idempotencyKey && this.idempotencyManager.isProcessing(idempotencyKey)) {
        this.idempotencyManager.release(idempotencyKey);
      }
    }
  }

  private resolveClientIp(request: Request, providedIp?: string): string {
    if (providedIp) return providedIp;
    if (this.options.security?.trustProxy) {
      const forwarded = request.headers.get('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
    }
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp;
    return 'unknown';
  }

  private async finalizeResponse(response: Response, request: Request, startTime: number, reqId?: string): Promise<Response> {
    // 1. Calculate and set response time & request ID headers
    const durationMs = (performance.now() - startTime).toFixed(2);
    const headers = new Headers(response.headers);
    headers.set('X-Response-Time', `${durationMs}ms`);

    const effectiveReqId = reqId || request.headers.get('x-request-id');
    if (effectiveReqId) {
      headers.set('X-Request-ID', effectiveReqId);
    }

    // Record metrics
    try {
      const url = new URL(request.url);
      this.metrics.recordRequest(request.method, url.pathname, response.status, parseFloat(durationMs));
    } catch {}

    let finalRes = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    // 2. Append Security Headers
    if (this.options.security?.headers !== false) {
      finalRes = applySecurityHeaders(finalRes, this.options.security?.headers);
    }

    // 3. Append CORS Headers
    if (this.options.security?.cors !== false) {
      const corsConfig = typeof this.options.security?.cors === 'object' ? this.options.security.cors : {};
      finalRes = appendCorsHeaders(finalRes, request, corsConfig);
    }

    // 4. Stream Compression
    if (this.options.compression) {
      const compConfig = typeof this.options.compression === 'object' ? this.options.compression : {};
      finalRes = await compressResponse(finalRes, request, compConfig);
    }

    return finalRes;
  }

  public listen(port?: number, callback?: () => void): any {
    const listenPort = port || this.options.port || 3000;

    // If running in Bun
    if (typeof (globalThis as any).Bun !== 'undefined') {
      let server: any;
      server = (globalThis as any).Bun.serve({
        port: listenPort,
        fetch: (req: Request) => this.handle(req, server?.requestIP?.(req)?.address),
      });
      callback?.();
      return server;
    }

    // If running in Node.js
    const http = require('node:http');
    const { createServer } = http;

    const server = createServer(async (req: any, res: any) => {
      try {
        const protocol = req.socket?.encrypted ? 'https' : 'http';
        const fullUrl = `${protocol}://${req.headers.host || 'localhost'}${req.url}`;

        // Buffer incoming body for Node.js
        const chunks: Uint8Array[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

        const webReq = new Request(fullUrl, {
          method: req.method,
          headers: req.headers,
          body: bodyBuffer,
          // @ts-ignore
          duplex: 'half',
        });

        const webRes = await this.handle(webReq, req.socket?.remoteAddress);

        res.statusCode = webRes.status;
        webRes.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        const responseArrayBuffer = await webRes.arrayBuffer();
        res.end(Buffer.from(responseArrayBuffer));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err?.message || 'Server Error' }));
      }
    });

    server.listen(listenPort, () => {
      callback?.();
    });

    return server;
  }
}

export function createApp(options?: FireAppOptions): FireApp {
  return new FireApp(options);
}
