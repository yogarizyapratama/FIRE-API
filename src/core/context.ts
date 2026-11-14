import { FireCacheManager, FireContext, FireDatabase, FireQueue, FireStorage, UploadedFile } from '../types';
import { HttpError } from './error';
import { createSSEResponse } from '../stream/sse';
import { WebhookVerifier } from '../shield/webhook';
import { FireLogger } from '../logging/logger';

function parseQuery(urlStr: string): Record<string, string | string[]> {
  const url = new URL(urlStr, 'http://localhost');
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((val, key) => {
    if (key in query) {
      if (Array.isArray(query[key])) {
        (query[key] as string[]).push(val);
      } else {
        query[key] = [query[key] as string, val];
      }
    } else {
      query[key] = val;
    }
  });
  return query;
}

const dummyDb: FireDatabase = {
  table() {
    throw new Error('Database not initialized. Configure database in createApp({ database: ... })');
  },
  async raw() {
    throw new Error('Database not initialized');
  },
  async transaction() {
    throw new Error('Database not initialized');
  },
  async tx() {
    throw new Error('Database not initialized');
  },
};

const dummyCache: FireCacheManager = {
  async get() { return null; },
  async set() {},
  async invalidate() {},
  async clear() {},
};

const dummyQueue: FireQueue = {
  async dispatch(name, data) {
    return {
      id: 'dummy',
      name,
      data,
      attempts: 0,
      maxAttempts: 1,
      createdAt: Date.now(),
      status: 'pending',
    };
  },
  handle() {},
};

const dummyStorage: FireStorage = {
  async put(path, content) {
    const size = typeof content === 'string' ? content.length : (content as Uint8Array).byteLength || 0;
    return { path, url: `/uploads/${path}`, size };
  },
  async get() { return null; },
  async getText() { return null; },
  async delete() { return true; },
  async exists() { return false; },
  url(path) { return `/uploads/${path}`; },
};

export interface CreateContextOptions {
  req: Request;
  params?: Record<string, string>;
  db?: FireDatabase;
  cache?: FireCacheManager;
  queue?: FireQueue;
  storage?: FireStorage;
  user?: any;
  body?: any;
  files?: Record<string, UploadedFile>;
  rawBody?: string;
  requestId?: string;
  traceId?: string;
  logger?: any;
  tenant?: { id: string; [key: string]: any };
  emit?: (event: string, payload?: any) => Promise<void>;
}

export function createContext(opts: CreateContextOptions): FireContext {
  const {
    req,
    params = {},
    db = dummyDb,
    cache = dummyCache,
    queue = dummyQueue,
    storage = dummyStorage,
    user = null,
    body = null,
    files = {},
    rawBody = '',
    emit,
  } = opts;
  const query = parseQuery(req.url);
  const state: Record<string, any> = {};
  const webhookVerifier = new WebhookVerifier(req, rawBody);
  const requestId = opts.requestId || req.headers.get('x-request-id') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const traceId = opts.traceId || req.headers.get('traceparent') || undefined;
  const log = opts.logger || new FireLogger(requestId);

  const ctx: FireContext = {
    req,
    params,
    query,
    body,
    files,
    user,
    db,
    cache,
    queue,
    storage,
    state,
    rawBody,
    requestId,
    traceId,
    log,
    tenant: opts.tenant,

    emit: async (event: string, payload?: any) => {
      if (emit) {
        await emit(event, payload);
      }
    },

    webhook: {
      verifyHMAC: (options) => webhookVerifier.verifyHMAC(options),
    },

    stream: {
      sse(handler) {
        return createSSEResponse(handler);
      },
    },

    earlyHints(links: string[]) {
      if (!ctx.state.earlyHints) {
        ctx.state.earlyHints = [];
      }
      ctx.state.earlyHints.push(...links);
    },

    json(data: any, status = 200, headers?: HeadersInit): Response {
      const respHeaders = new Headers(headers);
      if (!respHeaders.has('Content-Type')) {
        respHeaders.set('Content-Type', 'application/json; charset=utf-8');
      }
      return new Response(JSON.stringify(data), {
        status,
        headers: respHeaders,
      });
    },

    ok(data: any): Response {
      return ctx.json(data, 200);
    },

    created(data: any): Response {
      return ctx.json(data, 201);
    },

    noContent(): Response {
      return new Response(null, { status: 204 });
    },

    badRequest(errors: any): Response {
      const msg = typeof errors === 'string' ? errors : (errors?.message || 'Bad Request');
      return new HttpError(400, msg, errors).toResponse();
    },

    unauthorized(message = 'Unauthorized'): Response {
      return new HttpError(401, message).toResponse();
    },

    forbidden(message = 'Forbidden'): Response {
      return new HttpError(403, message).toResponse();
    },

    notFound(message = 'Not Found'): Response {
      return new HttpError(404, message).toResponse();
    },

    internalError(message = 'Internal Server Error'): Response {
      return new HttpError(500, message).toResponse();
    },

    text(content: string, status = 200, headers?: HeadersInit): Response {
      const respHeaders = new Headers(headers);
      if (!respHeaders.has('Content-Type')) {
        respHeaders.set('Content-Type', 'text/plain; charset=utf-8');
      }
      return new Response(content, { status, headers: respHeaders });
    },

    html(content: string, status = 200, headers?: HeadersInit): Response {
      const respHeaders = new Headers(headers);
      if (!respHeaders.has('Content-Type')) {
        respHeaders.set('Content-Type', 'text/html; charset=utf-8');
      }
      return new Response(content, { status, headers: respHeaders });
    },
  };

  return ctx;
}
