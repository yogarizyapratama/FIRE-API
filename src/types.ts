export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface TableModel<T = any> extends QueryBuilder {
  find(filter?: Record<string, any>): Promise<T[]>;
  findOne(filter?: Record<string, any>): Promise<T | null>;
  findById(id: string | number): Promise<T | null>;
  insert(data: Record<string, any> | Record<string, any>[]): Promise<T>;
  update(idOrFilter: string | number | Record<string, any>, data?: Record<string, any>): Promise<T>;
  delete(idOrFilter?: string | number | Record<string, any>): Promise<{ count: number }>;
  include(relation: string | string[]): TableModel<T>;
}

export interface FireDatabase {
  table(name: string): QueryBuilder;
  raw<T = any>(sql: string, params?: any[]): Promise<T>;
  transaction<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T>;
  tx<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T>;
  seed(tableName: string, schema: any, count?: number): Promise<any[]>;
  [table: string]: any;
}

export interface QueryBuilder {
  find<T = any>(): Promise<T[]>;
  findOne<T = any>(): Promise<T | null>;
  findById<T = any>(id: string | number): Promise<T | null>;
  where(field: string, operatorOrValue: any, value?: any): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;
  orderBy(field: string, direction?: 'asc' | 'desc'): QueryBuilder;
  include(relation: string | string[]): QueryBuilder;
  insert<T = any>(data: Record<string, any> | Record<string, any>[]): Promise<T>;
  update<T = any>(data: Record<string, any>): Promise<T>;
  delete(): Promise<{ count: number }>;
}

export interface FireCacheManager {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number, tags?: string[]): Promise<void>;
  invalidate(tag: string): Promise<void>;
  clear(): Promise<void>;
}

export interface FireQueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface FireQueue {
  dispatch<T = any>(name: string, data: T, options?: { maxAttempts?: number; delayMs?: number }): Promise<FireQueueJob<T>>;
  handle<T = any>(name: string, worker: (data: T, job: FireQueueJob<T>) => Promise<void> | void): void;
}

export interface FireStorage {
  put(filePath: string, content: string | Uint8Array | ArrayBuffer, options?: { contentType?: string; access?: 'public' | 'private' }): Promise<{ path: string; url: string; size: number }>;
  get(filePath: string): Promise<Uint8Array | null>;
  getText(filePath: string): Promise<string | null>;
  delete(filePath: string): Promise<boolean>;
  exists(filePath: string): Promise<boolean>;
  url(filePath: string): string;
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  bytes(): Promise<Uint8Array>;
  text(): Promise<string>;
  store(destinationDir?: string, options?: { fileName?: string }): Promise<{ path: string; url: string; size: number }>;
}

export interface FireContext<
  TParams = Record<string, string>,
  TQuery = Record<string, string | string[]>,
  TBody = any,
  TUser = any
> {
  req: Request;
  params: TParams;
  query: TQuery;
  body: TBody;
  files: Record<string, UploadedFile>;
  user: TUser;
  db: FireDatabase;
  cache: FireCacheManager;
  queue: FireQueue;
  storage: FireStorage;
  state: Record<string, any>;
  rawBody: string;
  requestId: string;
  traceId?: string;
  log: any;
  tenant?: { id: string; [key: string]: any };

  // Event Emitter
  emit<T = any>(event: string, payload?: T): Promise<void>;

  // Turnkey Webhook Verifier
  webhook: {
    verifyHMAC(options: {
      secret: string;
      header?: string;
      signature?: string;
      algorithm?: 'SHA-256' | 'SHA-1' | 'SHA-512';
    }): Promise<boolean>;
  };

  // Streaming helpers
  stream: {
    sse(handler: (stream: { send(data: any, options?: { event?: string; id?: string; retry?: number }): Promise<void>; close(): void }) => Promise<void> | void): Response;
  };

  // Modern HTTP helpers
  earlyHints(links: string[]): void;

  // Response helpers
  json<T = any>(data: T, status?: number, headers?: HeadersInit): Response;
  ok<T = any>(data: T): Response;
  created<T = any>(data: T): Response;
  noContent(): Response;
  badRequest(errors: any): Response;
  unauthorized(message?: string): Response;
  forbidden(message?: string): Response;
  notFound(message?: string): Response;
  internalError(message?: string): Response;
  text(content: string, status?: number, headers?: HeadersInit): Response;
  html(content: string, status?: number, headers?: HeadersInit): Response;
}

export type Handler<
  TParams = any,
  TQuery = any,
  TBody = any,
  TRes = any
> = (ctx: FireContext<TParams, TQuery, TBody>) => Promise<Response | TRes> | Response | TRes;

export type Middleware = (
  ctx: FireContext,
  next: () => Promise<Response>
) => Promise<Response>;

export interface RouteSchema {
  params?: any;
  query?: any;
  body?: any;
  response?: any;
}

export interface RouteAIMetadata {
  description: string;
  operationId?: string;
  tags?: string[];
}

export interface RouteSecurityConfig {
  auth?: 'bearer' | 'apiKey' | 'basic' | boolean;
  rateLimit?: string | { max: number; window: string };
  roles?: string[];
}

export interface RouteOptions<TParams = any, TQuery = any, TBody = any, TRes = any> {
  schema?: RouteSchema;
  security?: (string | RouteSecurityConfig)[];
  cache?: { ttl: string | number; swr?: string | number; tags?: string[] };
  idempotent?: boolean | { ttl?: number };
  ai?: RouteAIMetadata;
  roles?: string[];
  can?: (user: any, ctx: FireContext) => boolean | Promise<boolean>;
  middlewares?: Middleware[];
  handler: Handler<TParams, TQuery, TBody, TRes>;
}

export interface RouteMatch {
  handler: Handler;
  routeOptions: RouteOptions;
  params: Record<string, string>;
  middlewares: Middleware[];
}

export interface FireSecurityOptions {
  enabled?: boolean;
  cors?: boolean | {
    origin?: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
  rateLimit?: {
    max: number;
    window: string; // e.g. '1m', '15m', '1h'
  };
  headers?: boolean | {
    contentSecurityPolicy?: boolean | string;
    frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
    nosniff?: boolean;
    hsts?: boolean | { maxAge: number; includeSubDomains?: boolean };
  };
  prototypePollutionGuard?: boolean;
  maxBodySize?: number; // In bytes (default 1MB)
}

export interface FireDatabaseOptions {
  driver?: 'memory' | 'sqlite' | 'postgres' | 'mysql';
  url?: string;
  autoMock?: boolean;
}

export interface FireCacheOptions {
  enabled?: boolean;
  defaultTTL?: number | string;
}

export type HookType = 'onRequest' | 'beforeHandle' | 'afterHandle' | 'onError';

export interface FireHealthOptions {
  livenessPath?: string; // default '/healthz'
  readinessPath?: string; // default '/readyz'
  checkDatabase?: boolean;
  checkStorage?: boolean;
  customChecks?: Array<() => Promise<{ name: string; status: 'ok' | 'degraded' | 'down'; message?: string }>>;
}

export interface FireAppOptions {
  port?: number;
  security?: FireSecurityOptions;
  database?: FireDatabaseOptions;
  cache?: FireCacheOptions;
  storage?: { driver?: 'memory' | 'local'; rootDir?: string; baseUrl?: string };
  compression?: boolean | { threshold?: number };
  docs?: string | false; // default '/docs'
  openapiPath?: string | false; // default '/openapi.json'
  metricsPath?: string | false; // default '/metrics'
  health?: boolean | FireHealthOptions;
  multiTenant?: { header?: string; query?: string; autoScopeDB?: boolean };
  prefix?: string;
}
