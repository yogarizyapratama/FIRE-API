import * as fs from 'fs';
import * as path from 'path';

export interface CreateAppOptions {
  name: string;
  template?: 'standard' | 'minimal';
  targetDir?: string;
}

export function createAppProject(options: CreateAppOptions): { projectDir: string; filesCreated: string[] } {
  const projectName = options.name || 'my-fire-api';
  const baseDir = options.targetDir || path.resolve(process.cwd(), projectName);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const filesCreated: string[] = [];

  const writeFile = (relPath: string, content: string) => {
    const fullPath = path.join(baseDir, relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content.trim() + '\n', 'utf-8');
    filesCreated.push(relPath);
  };

  // 1. package.json
  writeFile('package.json', JSON.stringify({
    name: projectName,
    version: '1.0.0',
    description: 'High-performance API built with FireAPI',
    type: 'module',
    main: 'src/index.ts',
    scripts: {
      dev: 'bun --watch src/index.ts',
      start: 'bun src/index.ts',
      test: 'bun test',
      compile: 'fire compile ./dist/server',
      docker: 'fire docker',
      routes: 'fire routes',
    },
    dependencies: {
      'fire-api': '^1.0.0',
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      typescript: '^5.0.0',
    },
  }, null, 2));

  // 2. tsconfig.json
  writeFile('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      outDir: './dist',
    },
    include: ['src/**/*', 'test/**/*'],
  }, null, 2));

  // 3. .env.example & .env
  const envContent = `PORT=3000
NODE_ENV=development
JWT_SECRET=super_secret_jwt_key_change_me_in_prod
DB_DRIVER=sqlite
DB_URL=./data.db
CORS_ORIGIN=*
`;
  writeFile('.env.example', envContent);
  writeFile('.env', envContent);

  // 4. .gitignore
  writeFile('.gitignore', `node_modules/
dist/
data.db
*.log
.env
.DS_Store
`);

  // 5. README.md
  writeFile('README.md', `# 🔥 ${projectName}

High-performance, modern Web Standard API built with **FireAPI**.

## 🚀 Quick Start

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

  // 6. src/index.ts
  writeFile('src/index.ts', `import { createApp, enableStudio } from 'fire-api';
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

// Start Server
app.listen(port, () => {
  console.log(\`🔥 \${projectName} running at http://localhost:\${port}\`);
  console.log(\`📖 Interactive Docs:   http://localhost:\${port}/docs\`);
  console.log(\`🖥️ FireStudio:         http://localhost:\${port}/studio\`);
  console.log(\`🩺 Health Probes:      http://localhost:\${port}/healthz\`);
});

export type AppRouter = typeof app;
export default app;
`);

  // 7. src/modules/users/users.schema.ts
  writeFile('src/modules/users/users.schema.ts', `import { s, type Infer } from 'fire-api';

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

  // 8. src/modules/users/users.router.ts
  writeFile('src/modules/users/users.router.ts', `import { createRouter } from 'fire-api';
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

  // 9. src/modules/auth/auth.router.ts
  writeFile('src/modules/auth/auth.router.ts', `import { createAuth } from 'fire-api';

// Turnkey Web Crypto PBKDF2 + JWT Authentication Sub-Router
export const authRouter = createAuth({
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_123',
  tokenExpiresIn: '7d',
});
`);

  // 10. test/app.test.ts
  writeFile('test/app.test.ts', `import { describe, expect, it } from 'bun:test';
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
