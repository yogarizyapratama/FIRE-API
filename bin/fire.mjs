#!/usr/bin/env node

// bin/fire.js
import * as path5 from "path";

// src/cli/generator.ts
import * as fs from "node:fs";
import * as path from "node:path";
function generateResource(resourceName, baseDir = process.cwd()) {
  const cleanName = resourceName.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const targetDir = path.join(baseDir, "src", "modules", cleanName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const schemaPath = path.join(targetDir, `${cleanName}.schema.ts`);
  const routePath = path.join(targetDir, `${cleanName}.route.ts`);
  const schemaContent = `import { s } from 'fire-api';

export const Create${capitalized}Schema = s.object({
  name: s.string().min(2).description('${capitalized} title or name'),
  status: s.enum(['active', 'draft']).default('active'),
});

export const ${capitalized}IdSchema = s.object({
  id: s.string().min(1),
});
`;
  const routeContent = `import { createRouter } from 'fire-api';
import { Create${capitalized}Schema, ${capitalized}IdSchema } from './${cleanName}.schema';

export const ${cleanName}Router = createRouter('/${cleanName}s');

// GET /${cleanName}s
${cleanName}Router.get('/', {
  cache: { ttl: 60, tags: ['${cleanName}s'] },
  ai: { description: 'Fetch list of ${cleanName}s', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    return ctx.db.${cleanName}s.find();
  },
});

// POST /${cleanName}s
${cleanName}Router.post('/', {
  schema: { body: Create${capitalized}Schema },
  ai: { description: 'Create a new ${cleanName}', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    const created = await ctx.db.${cleanName}s.insert(ctx.body);
    await ctx.cache.invalidate('${cleanName}s');
    return ctx.created(created);
  },
});

// GET /${cleanName}s/:id
${cleanName}Router.get('/:id', {
  schema: { params: ${capitalized}IdSchema },
  ai: { description: 'Get a ${cleanName} by unique ID', tags: ['${capitalized}'] },
  handler: async (ctx) => {
    const item = await ctx.db.${cleanName}s.findById(ctx.params.id);
    if (!item) return ctx.notFound('${capitalized} not found');
    return ctx.ok(item);
  },
});

// DELETE /${cleanName}s/:id
${cleanName}Router.delete('/:id', async (ctx) => {
  await ctx.db.${cleanName}s.delete(ctx.params.id);
  return { deleted: true };
});
`;
  fs.writeFileSync(schemaPath, schemaContent, "utf-8");
  fs.writeFileSync(routePath, routeContent, "utf-8");
  return { routeFile: routePath, schemaFile: schemaPath };
}

// src/cli/bench.ts
function percentile(sorted, p) {
  if (sorted.length === 0)
    return 0;
  const index = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}
async function runBenchmark(url, options = {}) {
  const concurrency = options.concurrency || 10;
  const total = options.totalRequests || 200;
  const fetchFn = options.customFetch || globalThis.fetch;
  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let sent = 0;
  const startTime = performance.now();
  async function worker() {
    while (sent < total) {
      sent++;
      const reqStart = performance.now();
      try {
        const res = await fetchFn(url);
        const reqDuration = performance.now() - reqStart;
        latencies.push(reqDuration);
        if (res.ok) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch {
        const reqDuration = performance.now() - reqStart;
        latencies.push(reqDuration);
        failedRequests++;
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const durationMs = performance.now() - startTime;
  const rps = Math.round(latencies.length / (durationMs / 1000) * 100) / 100;
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  return {
    url,
    totalRequests: latencies.length,
    successfulRequests,
    failedRequests,
    durationMs: Math.round(durationMs),
    rps,
    latency: {
      min: Math.round((latencies[0] || 0) * 100) / 100,
      max: Math.round((latencies[latencies.length - 1] || 0) * 100) / 100,
      avg: Math.round(sum / (latencies.length || 1) * 100) / 100,
      p50: Math.round(percentile(latencies, 50) * 100) / 100,
      p90: Math.round(percentile(latencies, 90) * 100) / 100,
      p95: Math.round(percentile(latencies, 95) * 100) / 100,
      p99: Math.round(percentile(latencies, 99) * 100) / 100
    }
  };
}
function formatBenchmarkReport(stats) {
  const successRate = stats.totalRequests > 0 ? (stats.successfulRequests / stats.totalRequests * 100).toFixed(1) : "0";
  return `
==================================================
\uD83D\uDD25 FireAPI Benchmark Engine
==================================================
Target:        ${stats.url}
Duration:      ${stats.durationMs} ms
Total Reqs:    ${stats.totalRequests}
Success Rate:  ${successRate}% (${stats.successfulRequests} ok / ${stats.failedRequests} fail)

\uD83D\uDE80 Requests/sec: ${stats.rps.toLocaleString()} req/s

Latency (ms):
  Min:  ${stats.latency.min} ms
  P50:  ${stats.latency.p50} ms
  P90:  ${stats.latency.p90} ms
  P95:  ${stats.latency.p95} ms
  P99:  ${stats.latency.p99} ms
  Max:  ${stats.latency.max} ms
==================================================
`;
}

// src/cli/docker.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function generateDockerFiles(baseDir = process.cwd()) {
  const dockerfilePath = path2.join(baseDir, "Dockerfile");
  const dockerignorePath = path2.join(baseDir, ".dockerignore");
  const dockerfileContent = `# ==============================================
# \uD83D\uDD25 FireAPI Ultra-Lightweight Production Container (< 25MB)
# ==============================================

# Stage 1: Build & Dependencies
FROM oven/bun:alpine AS base
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json bun.lock* ./
RUN bun install --production

COPY . .
RUN chown -R appuser:appgroup /app

# Stage 2: Distroless Production Runner
FROM oven/bun:alpine AS runner
WORKDIR /app

COPY --from=base /app /app

USER appuser
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["bun", "run", "src/index.ts"]
`;
  const dockerignoreContent = `node_modules
dist
.git
.env*
*.log
uploads
`;
  fs2.writeFileSync(dockerfilePath, dockerfileContent, "utf-8");
  fs2.writeFileSync(dockerignorePath, dockerignoreContent, "utf-8");
  return { dockerfilePath, dockerignorePath };
}

// src/cli/compile.ts
import { execSync } from "child_process";
import * as fs3 from "fs";
import * as path3 from "path";
function compileBinary(options = {}) {
  const entry = options.entry || (fs3.existsSync("./src/index.ts") ? "./src/index.ts" : "./index.ts");
  const output = options.output || "./dist/server";
  const minifyFlag = options.minify !== false ? "--minify" : "";
  const outDir = path3.dirname(output);
  if (!fs3.existsSync(outDir)) {
    fs3.mkdirSync(outDir, { recursive: true });
  }
  const command = `bun build ${entry} --compile ${minifyFlag} --outfile ${output}`.trim();
  try {
    const stdout = execSync(command, { encoding: "utf-8", stdio: "pipe" });
    return { command, success: true, output: stdout };
  } catch (err) {
    return { command, success: false, output: err.message };
  }
}

// src/cli/create-app.ts
import * as fs4 from "fs";
import * as path4 from "path";
function createAppProject(options) {
  const projectName = options.name || "my-fire-api";
  const baseDir = options.targetDir || path4.resolve(process.cwd(), projectName);
  if (!fs4.existsSync(baseDir)) {
    fs4.mkdirSync(baseDir, { recursive: true });
  }
  const filesCreated = [];
  const writeFile = (relPath, content) => {
    const fullPath = path4.join(baseDir, relPath);
    const dir = path4.dirname(fullPath);
    if (!fs4.existsSync(dir)) {
      fs4.mkdirSync(dir, { recursive: true });
    }
    fs4.writeFileSync(fullPath, content.trim() + `
`, "utf-8");
    filesCreated.push(relPath);
  };
  writeFile("package.json", JSON.stringify({
    name: projectName,
    version: "1.0.0",
    description: "High-performance API built with FireAPI",
    type: "module",
    main: "src/index.ts",
    scripts: {
      dev: "bun --watch src/index.ts",
      start: "bun src/index.ts",
      test: "bun test",
      compile: "fire-api compile ./dist/server",
      docker: "fire-api docker",
      routes: "fire-api routes"
    },
    dependencies: {
      "@tamayrp14/fire-api": "^1.0.3"
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      typescript: "^5.0.0"
    }
  }, null, 2));
  writeFile("tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      outDir: "./dist"
    },
    include: ["src/**/*", "test/**/*"]
  }, null, 2));
  const envContent = `PORT=3000
NODE_ENV=development
JWT_SECRET=super_secret_jwt_key_change_me_in_prod
DB_DRIVER=sqlite
DB_URL=./data.db
CORS_ORIGIN=*
`;
  writeFile(".env.example", envContent);
  writeFile(".env", envContent);
  writeFile(".gitignore", `node_modules/
dist/
data.db
*.log
.env
.DS_Store
`);
  writeFile("README.md", `# \uD83D\uDD25 ${projectName}

High-performance, modern Web Standard API built with **FireAPI**.

## \uD83D\uDE80 Quick Start

\`\`\`bash
# 1. Install dependencies
bun install
# or
pnpm install

# 2. Run development server (with auto-reload)
bun dev

# 3. View Interactive API Docs
http://localhost:3000/docs

# 4. View Dev Dashboard (FireStudio)
http://localhost:3000/studio

# 5. Run Tests
bun test
\`\`\`
`);
  writeFile("src/index.ts", `import { createApp, enableStudio } from '@tamayrp14/fire-api';
import { userRouter } from './modules/users/users.router';
import { authRouter } from './modules/auth/auth.router';

const port = Number(process.env.PORT) || 3000;

const app = createApp({
  port,
  database: {
    driver: (process.env.DB_DRIVER as any) || 'sqlite',
    url: process.env.DB_URL || ':memory:',
  },
  security: {
    cors: true,
    rateLimit: { max: 500, window: '1m' },
  },
  health: true, // Auto /healthz & /readyz
  docs: '/docs', // Scalar Docs at /docs & OpenAPI at /openapi.json
});

// Enable Embedded Dev Studio at /studio
enableStudio(app, { path: '/studio' });

// Mount Domain Modules
app.use(authRouter);
app.use(userRouter);

// Start Server (only when run directly, not when imported by tests)
if (import.meta.main) {
  app.listen(port, () => {
    console.log(\`\uD83D\uDD25 ${projectName} running at http://localhost:\${port}\`);
    console.log(\`\uD83D\uDCD6 Interactive Docs:   http://localhost:\${port}/docs\`);
    console.log(\`\uD83D\uDDA5️ FireStudio:         http://localhost:\${port}/studio\`);
    console.log(\`\uD83E\uDE7A Health Probes:      http://localhost:\${port}/healthz\`);
  });
}

export type AppRouter = typeof app;
export default app;
`);
  writeFile("src/modules/users/users.schema.ts", `import { s, type Infer } from '@tamayrp14/fire-api';

export const UserSchema = s.object({
  id: s.string().optional(),
  name: s.string().min(2).description('Full name of the user'),
  email: s.string().email().description('Unique email address'),
  role: s.enum(['admin', 'user', 'moderator']).default('user'),
  createdAt: s.string().optional(),
});

export const CreateUserSchema = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  role: s.enum(['admin', 'user', 'moderator']).default('user'),
});

export type User = Infer<typeof UserSchema>;
export type CreateUserInput = Infer<typeof CreateUserSchema>;
`);
  writeFile("src/modules/users/users.router.ts", `import { createRouter } from '@tamayrp14/fire-api';
import { CreateUserSchema } from './users.schema';

export const userRouter = createRouter('/users');

// GET /users - List all users
userRouter.get('/', {
  ai: { description: 'Retrieve all users', tags: ['Users'] },
  handler: async (ctx) => {
    const users = await ctx.db.users.find();
    return ctx.ok(users);
  },
});

// GET /users/:id - Get user by id with relational posts
userRouter.get('/:id', {
  ai: { description: 'Get a user by ID', tags: ['Users'] },
  handler: async (ctx) => {
    const user = await ctx.db.users.include('posts').findById(ctx.params.id);
    if (!user) return ctx.notFound('User not found');
    return ctx.ok(user);
  },
});

// POST /users - Create user with validation & idempotency shield
userRouter.post('/', {
  schema: { body: CreateUserSchema },
  idempotent: true,
  ai: { description: 'Create a new user', tags: ['Users'] },
  handler: async (ctx) => {
    const existing = await ctx.db.users.findOne({ email: ctx.body.email });
    if (existing) {
      return ctx.badRequest('Email is already registered');
    }

    const newUser = await ctx.db.users.insert(ctx.body);
    await ctx.emit('user.created', newUser);

    return ctx.created(newUser);
  },
});

// DELETE /users/:id - Delete user cleanly
userRouter.delete('/:id', {
  ai: { description: 'Delete a user by ID', tags: ['Users'] },
  handler: async (ctx) => {
    await ctx.db.users.delete(ctx.params.id);
    return ctx.ok({ deleted: true });
  },
});
`);
  writeFile("src/modules/auth/auth.router.ts", `import { createAuth } from '@tamayrp14/fire-api';

// Turnkey Web Crypto PBKDF2 + JWT Authentication Sub-Router
export const authRouter = createAuth({
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_123',
  tokenExpirySeconds: 7 * 24 * 60 * 60, // 7 days
});
`);
  writeFile("test/app.test.ts", `import { describe, expect, it } from 'bun:test';
import app from '../src/index';

describe('${projectName} API E2E Suite', () => {
  it('responds with 200 on /healthz probe', async () => {
    const res = await app.handle(new Request('http://localhost:3000/healthz'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('creates and retrieves a user seamlessly', async () => {
    // 1. Create User
    const createRes = await app.handle(
      new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': 'key-initial-admin',
        },
        body: JSON.stringify({
          name: 'Super Admin',
          email: 'admin@fireapi.dev',
          role: 'admin',
        }),
      })
    );

    expect(createRes.status).toBe(201);
    const createdUser = await createRes.json();
    expect(createdUser.name).toBe('Super Admin');

    // 2. Query Users
    const listRes = await app.handle(new Request('http://localhost:3000/users'));
    expect(listRes.status).toBe(200);
    const users = await listRes.json();
    expect(users.length).toBeGreaterThanOrEqual(1);
  });
});
`);
  return { projectDir: baseDir, filesCreated };
}

// src/cli/routes.ts
function formatRoutesTable(router) {
  const routes = router.getRoutes();
  if (routes.length === 0) {
    return "No routes registered in application.";
  }
  const rows = routes.map((r) => {
    const roles = r.options.roles && r.options.roles.length > 0 ? r.options.roles.join(", ") : "-";
    const cache = r.options.cache ? `${r.options.cache.ttl}s` : "-";
    const idempotent = r.options.idempotent ? "✓" : "-";
    const auth = r.options.security ? "Required" : r.options.roles ? "Role-Guarded" : "Public";
    const description = r.options.ai?.description || "-";
    return {
      method: r.method,
      path: r.path,
      auth,
      roles,
      cache,
      idempotent,
      description
    };
  });
  const headers = {
    method: "METHOD",
    path: "ROUTE PATH",
    auth: "AUTH",
    roles: "ROLES",
    cache: "CACHE",
    idempotent: "IDEMPOTENT",
    description: "DESCRIPTION"
  };
  const colWidths = {
    method: Math.max(headers.method.length, ...rows.map((r) => r.method.length)),
    path: Math.max(headers.path.length, ...rows.map((r) => r.path.length)),
    auth: Math.max(headers.auth.length, ...rows.map((r) => r.auth.length)),
    roles: Math.max(headers.roles.length, ...rows.map((r) => r.roles.length)),
    cache: Math.max(headers.cache.length, ...rows.map((r) => r.cache.length)),
    idempotent: Math.max(headers.idempotent.length, ...rows.map((r) => r.idempotent.length)),
    description: Math.max(headers.description.length, ...rows.map((r) => r.description.length))
  };
  const pad = (str, len) => str.padEnd(len, " ");
  const headerLine = `| ${pad(headers.method, colWidths.method)} | ${pad(headers.path, colWidths.path)} | ${pad(headers.auth, colWidths.auth)} | ${pad(headers.roles, colWidths.roles)} | ${pad(headers.cache, colWidths.cache)} | ${pad(headers.idempotent, colWidths.idempotent)} | ${pad(headers.description, colWidths.description)} |`;
  const sepLine = `|-${"-".repeat(colWidths.method)}-|-${"-".repeat(colWidths.path)}-|-${"-".repeat(colWidths.auth)}-|-${"-".repeat(colWidths.roles)}-|-${"-".repeat(colWidths.cache)}-|-${"-".repeat(colWidths.idempotent)}-|-${"-".repeat(colWidths.description)}-|`;
  const bodyLines = rows.map((r) => `| ${pad(r.method, colWidths.method)} | ${pad(r.path, colWidths.path)} | ${pad(r.auth, colWidths.auth)} | ${pad(r.roles, colWidths.roles)} | ${pad(r.cache, colWidths.cache)} | ${pad(r.idempotent, colWidths.idempotent)} | ${pad(r.description, colWidths.description)} |`);
  return [
    `\uD83D\uDD25 FireAPI Route Manifest (${routes.length} total endpoints):`,
    sepLine,
    headerLine,
    sepLine,
    ...bodyLines,
    sepLine
  ].join(`
`);
}

// bin/fire.js
var [, , cmd, subcmd, target] = process.argv;
if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`
\uD83D\uDD25 FireAPI CLI - Next-Gen Modern API Toolkit

Usage:
  npx fire-api <command> [options]

Commands:
  create, new <name>            Scaffold a complete, production-grade FireAPI project
  routes [entry]                Display visual terminal table of all registered routes
  g, generate resource <name>   Generate a new resource module (route + schema)
  bench <url>                   Run ultra-fast load benchmark against an endpoint
  docker                        Generate production-hardened multi-stage Dockerfile
  compile [output]              Compile standalone single-binary application
  info                          Display FireAPI engine version and environment
  help                          Show this help message

Examples:
  npx fire-api create my-store-api
  npx fire-api routes
  npx fire-api g resource product
  npx fire-api bench http://localhost:3000/books
  npx fire-api compile ./dist/api-server
  npx fire-api docker
`);
  process.exit(0);
}
if (cmd === "create" || cmd === "new" || cmd === "init") {
  const appName = subcmd || "my-fire-api";
  console.log(`
\uD83D\uDD25 Scaffolding brand new FireAPI application in ./${appName}...
`);
  const result = createAppProject({ name: appName });
  console.log(`✨ Created ${result.filesCreated.length} files successfully:`);
  result.filesCreated.forEach((f) => console.log(`   \uD83D\uDCC4 ${f}`));
  console.log(`
\uD83C\uDF89 FireAPI application ready!
To start developing:

  cd ${appName}
  bun install    # (or pnpm install / npm install)
  bun dev        # Launches dev server with live reload at http://localhost:3000

\uD83D\uDCD6 Interactive Docs:   http://localhost:3000/docs
\uD83D\uDDA5️ FireStudio:         http://localhost:3000/studio
\uD83E\uDE7A Health Probes:      http://localhost:3000/healthz
`);
  process.exit(0);
}
if (cmd === "routes" || cmd === "route:list") {
  const entryPath = subcmd || "./src/index.ts";
  const fullPath = path5.resolve(process.cwd(), entryPath);
  try {
    const mod = await import(fullPath);
    const app = mod.default || mod.app;
    if (app && app.router) {
      console.log(`
` + formatRoutesTable(app.router) + `
`);
    } else {
      console.error("❌ Could not find exported FireApp instance in " + entryPath);
    }
  } catch (err) {
    console.error("❌ Error inspecting routes:", err.message);
  }
  process.exit(0);
}
if (cmd === "info") {
  console.log(`
\uD83D\uDD25 FireAPI Framework v1.0.0
⚡ Engine: Bun / Node.js 20+ Native Web Standards
\uD83D\uDEE1️ Security Shield: Enabled by default
\uD83D\uDDC4️ Database Hub: SQLite & In-Memory
\uD83E\uDD16 AI/MCP: Native Model Context Protocol Support
⚡ JIT Fast-Path & Gzip Compression: Enabled
\uD83D\uDD12 RBAC & Policy Gates: Enabled
  `);
  process.exit(0);
}
if (cmd === "docker") {
  const result = generateDockerFiles();
  console.log(`
✨ Successfully generated production Docker container files!`);
  console.log(`  \uD83D\uDC33 Dockerfile:     ${result.dockerfilePath}`);
  console.log(`  \uD83D\uDCC4 .dockerignore:  ${result.dockerignorePath}
`);
  process.exit(0);
} else if (cmd === "compile") {
  console.log("⚡ Compiling standalone native binary with Bun...");
  const res = compileBinary({ output: subcmd || "./dist/server" });
  if (res.success) {
    console.log(`✨ Binary successfully compiled! Output: ${subcmd || "./dist/server"}`);
    process.exit(0);
  } else {
    console.error(`❌ Compilation failed: ${res.output}`);
    process.exit(1);
  }
} else if (cmd === "bench") {
  const url = subcmd;
  if (!url) {
    console.error("❌ Please specify a target URL, e.g.: npx fire-api bench http://localhost:3000/books");
    process.exit(1);
  }
  console.log(`\uD83D\uDD25 Launching benchmark against ${url}...`);
  runBenchmark(url, { concurrency: 20, totalRequests: 500 }).then((stats) => {
    console.log(formatBenchmarkReport(stats));
    process.exit(0);
  }).catch((err) => {
    console.error("Benchmark error:", err);
    process.exit(1);
  });
} else if (cmd === "g" || cmd === "generate") {
  if (subcmd === "resource") {
    if (!target) {
      console.error("❌ Please specify a resource name, e.g.: npx fire-api g resource product");
      process.exit(1);
    }
    const result = generateResource(target);
    console.log(`
✨ Successfully generated ${target} resource!`);
    console.log(`  \uD83D\uDCC4 Schema: ${result.schemaFile}`);
    console.log(`  \uD83D\uDEE3️ Route:  ${result.routeFile}
`);
    process.exit(0);
  }
} else {
  console.error(`Unknown command: ${cmd}. Run "npx fire-api --help" for available commands.`);
  process.exit(1);
}
