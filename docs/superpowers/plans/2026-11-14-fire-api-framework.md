# FireAPI Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package `fire-api`, the next-generation JavaScript/TypeScript API framework featuring universal DB connectivity, zero-config security shield, automatic schema validation, OpenAPI docs, zero-codegen E2E type-safe RPC client, and native Model Context Protocol (MCP) AI tool integration.

**Architecture:** Pure functional-modular core built on Web Standard `Request`/`Response` primitives. Integrates a high-speed radix tree router, FireShield security layer, FireDB universal database hub with auto-mocking, FireSchema validation & OpenAPI engine, FireClient proxy-based RPC, and FireAI MCP tool exporter.

**Tech Stack:** TypeScript (strict mode), Bun & Node.js 20+ runtime compatibility, native Web Standards.

**Spec:** [docs/superpowers/specs/fire-api-design-spec.md](file:///Users/mac/Documents/YOGA/YOGA%20GOKS/API-FIRE/docs/superpowers/specs/fire-api-design-spec.md)

---

## Global Constraints

- Zero mandatory external runtime dependencies for core routing, context, schema validation, and E2E client.
- Native TypeScript 5+ with strict type inference and zero `reflect-metadata` overhead.
- Web Standard Request/Response compatibility across Node.js, Bun, and Deno.
- Default-secure: Security headers, CORS, rate limiting, and prototype pollution guard enabled by default.
- 100% test coverage on router matching, schema validation, rate limiting, and database operations.

---

## Target File Structure

```text
packages/fire-api/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts               # Public exports (createApp, createRouter, s, etc.)
│   ├── client.ts              # FireClient: Zero-codegen E2E RPC Proxy
│   ├── types.ts               # Core type definitions
│   ├── core/
│   │   ├── router.ts          # Radix tree high-performance router
│   │   ├── context.ts         # FireContext (req, res, json, params, query, db)
│   │   ├── app.ts             # FireApp application container
│   │   └── error.ts           # HttpError hierarchy (400, 401, 403, 404, 500)
│   ├── schema/
│   │   ├── schema.ts          # FireSchema builder (string, number, object, array, enum)
│   │   ├── validator.ts       # Runtime schema validation engine
│   │   └── openapi.ts         # OpenAPI 3.1 generator from schema
│   ├── shield/
│   │   ├── headers.ts         # Helmet-style security headers
│   │   ├── cors.ts            # Configurable secure CORS handler
│   │   ├── rate-limiter.ts    # Sliding window rate limiter
│   │   └── sanitizer.ts       # Prototype pollution & payload sanitizer
│   ├── db/
│   │   ├── db-interface.ts    # Universal DB contract & query builder interface
│   │   ├── memory-adapter.ts  # Fast in-memory database adapter (zero-config default)
│   │   ├── sqlite-adapter.ts  # SQLite adapter (native Node/Bun)
│   │   └── hub.ts             # FireDB connection hub factory
│   ├── cache/
│   │   └── cache.ts           # SWR Cache engine with tag invalidation
│   ├── ai/
│   │   └── mcp.ts             # Native MCP (Model Context Protocol) tool exporter
│   ├── docs/
│   │   └── scalar-ui.ts       # Interactive Scalar API docs HTML renderer
│   └── server/
│       ├── node-adapter.ts    # Node.js http/https adapter
│       └── bun-adapter.ts     # Bun.serve native integration
└── test/
    ├── router.test.ts
    ├── context.test.ts
    ├── schema.test.ts
    ├── shield.test.ts
    ├── db.test.ts
    ├── client.test.ts
    ├── ai-mcp.test.ts
    ├── cache.test.ts
    └── integration.test.ts
```

---

## Tasks

### Task 1: Scaffolding Project & Core Setup
- [x] Initialize `package.json` with ESM, modern exports (`.` and `./client`), scripts, and test runner.
- [x] Configure `tsconfig.json` with strict TypeScript configuration (ES2022, NodeNext/Bundler).
- [x] Create core `src/types.ts` defining standard HTTP methods, route definitions, middleware signatures, and configuration interfaces.
- [x] Run test runner to verify clean environment.

### Task 2: Core Router & FireContext
- [x] Write tests in `test/router.test.ts` for route registration (`GET`, `POST`, `PUT`, `DELETE`), path parameters (`:id`), wildcards (`*`), and nested routers.
- [x] Implement `src/core/router.ts` with Radix-Tree matching logic.
- [x] Write tests in `test/context.test.ts` for `FireContext` helpers (`ctx.json`, `ctx.ok`, `ctx.created`, `ctx.badRequest`, `ctx.notFound`, `ctx.text`).
- [x] Implement `src/core/context.ts` wrapping Web Standard `Request` and creating `Response`.
- [x] Implement `src/core/error.ts` with typed `HttpError` classes and automatic error-handling pipeline.
- [x] Run router and context tests.

### Task 3: FireSchema Validation & Type Inference Engine
- [x] Write tests in `test/schema.test.ts` testing schema definitions (`s.string()`, `s.number()`, `s.boolean()`, `s.object()`, `s.array()`, `s.enum()`) and validation failures.
- [x] Implement `src/schema/schema.ts` defining chainable schema types with constraints (`min`, `max`, `email`, `regex`, `optional`, `default`).
- [x] Implement `src/schema/validator.ts` producing clean formatted validation error objects (`{ field, message, code }`).
- [x] Verify static type inference works with `Infer<typeof schema>`.
- [x] Run schema tests.

### Task 4: FireShield (Security Engine)
- [x] Write tests in `test/shield.test.ts` for security headers, CORS origin filtering, rate-limit counting/blocking, and prototype pollution rejection.
- [x] Implement `src/shield/headers.ts` adding standard security headers (`nosniff`, `SAMEORIGIN`, CSP, HSTS).
- [x] Implement `src/shield/cors.ts` handling preflight `OPTIONS` and CORS headers.
- [x] Implement `src/shield/rate-limiter.ts` with sliding window rate limiting.
- [x] Implement `src/shield/sanitizer.ts` guarding against `__proto__` pollution and payload overloads.
- [x] Run shield tests.

### Task 5: FireDB (Universal Multi-Engine Database Adapter & Auto-Mock)
- [x] Write tests in `test/db.test.ts` for CRUD operations: `table('users').insert()`, `findById()`, `where()`, `update()`, `delete()`.
- [x] Implement `src/db/db-interface.ts` defining standard database contract and fluent query interface.
- [x] Implement `src/db/memory-adapter.ts` for zero-dependency instant prototyping and testing.
- [x] Implement `src/db/sqlite-adapter.ts` for lightweight file/memory SQLite storage.
- [x] Implement `src/db/hub.ts` factory managing database connections and injecting into `ctx.db`.
- [x] Run DB tests.

### Task 6: FireCache (Smart SWR Caching & Tag Invalidation)
- [x] Write tests in `test/cache.test.ts` for caching responses, TTL expiration, and tag invalidation.
- [x] Implement `src/cache/cache.ts` providing Stale-While-Revalidate caching and `ctx.cache.invalidate(tag)`.
- [x] Run cache tests.

### Task 7: FireClient (Zero-Codegen End-to-End Type-Safe RPC)
- [x] Write tests in `test/client.test.ts` verifying frontend RPC client can call routes via proxy with autocomplete and type checking.
- [x] Implement `src/client.ts` using recursive JavaScript `Proxy` to translate `client.users[':id'].get({ params })` into HTTP requests.
- [x] Run client tests.

### Task 8: FireAI (Native Model Context Protocol - MCP Engine)
- [x] Write tests in `test/ai-mcp.test.ts` verifying registered routes with `ai` metadata export valid MCP tool schemas and execute correctly.
- [x] Implement `src/ai/mcp.ts` creating MCP Server manifests, tool list responses, and tool call handlers.
- [x] Run AI/MCP tests.

### Task 9: OpenAPI 3.1 & Interactive Documentation Engine
- [x] Write tests in `test/openapi.test.ts` verifying OpenAPI 3.1 JSON schema generation from registered routes and schemas.
- [x] Implement `src/schema/openapi.ts` converting `FireSchema` to OpenAPI 3.1 JSON format.
- [x] Implement `src/docs/scalar-ui.ts` rendering modern Scalar interactive API documentation page.
- [x] Mount `/docs` and `/openapi.json` endpoints automatically in `FireApp`.

### Task 10: Server Runtime Adapters & Integration Demo
- [x] Implement `src/core/app.ts` tying together Router, Context, FireShield, FireDB, FireCache, FireAI, and OpenAPI generator.
- [x] Implement `src/server/bun-adapter.ts` for native high-performance `Bun.serve`.
- [x] Implement `src/server/node-adapter.ts` for Node.js `node:http` compatibility.
- [x] Implement `src/index.ts` with clean, ergonomic public exports.
- [x] Write comprehensive integration test in `test/integration.test.ts` testing all subsystems working together in concert.
- [x] Create a runnable demo sample in `examples/basic-api/index.ts` showcasing the framework in action.
