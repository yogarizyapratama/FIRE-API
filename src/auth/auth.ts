import { createRouter, Router } from '../core/router';
import { Middleware } from '../types';
import { s } from '../schema/schema';
import { hashPassword, verifyPassword } from './crypto';
import { signJWT, verifyJWT } from './jwt';

export interface CreateAuthOptions {
  jwtSecret: string;
  tableName?: string;
  tokenExpirySeconds?: number;
}

export function createAuth(options: CreateAuthOptions): Router {
  const router = createRouter();
  const tableName = options.tableName || 'users';
  const secret = options.jwtSecret;
  const expiry = options.tokenExpirySeconds || 86400; // 24 hours

  // POST /register
  router.post('/register', {
    schema: {
      body: s.object({
        email: s.string().email(),
        password: s.string().min(6),
        name: s.string().optional(),
      }),
    },
    ai: { description: 'Register a new user account with credentials', tags: ['Auth'] },
    handler: async (ctx) => {
      const { email, password, name } = ctx.body;

      // Check if user already exists
      const existing = await ctx.db.table(tableName).where('email', email).findOne();
      if (existing) {
        return ctx.badRequest('A user with this email already exists');
      }

      const hashedPassword = await hashPassword(password);
      const newUser = await ctx.db.table(tableName).insert({
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
      });

      // Strip password from returned user object
      const safeUser = { id: newUser.id, email: newUser.email, name: newUser.name };
      const token = await signJWT(safeUser, secret, expiry);

      return ctx.created({ user: safeUser, token });
    },
  });

  // POST /login
  router.post('/login', {
    schema: {
      body: s.object({
        email: s.string().email(),
        password: s.string(),
      }),
    },
    ai: { description: 'Authenticate user with email and password', tags: ['Auth'] },
    handler: async (ctx) => {
      const { email, password } = ctx.body;

      const user = await ctx.db.table(tableName).where('email', email).findOne();
      if (!user) {
        return ctx.unauthorized('Invalid email or password');
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return ctx.unauthorized('Invalid email or password');
      }

      const safeUser = { id: user.id, email: user.email, name: user.name };
      const token = await signJWT(safeUser, secret, expiry);

      return ctx.ok({ user: safeUser, token });
    },
  });

  // GET /me
  router.get('/me', {
    middlewares: [requireAuth(secret)],
    ai: { description: 'Get authenticated user profile', tags: ['Auth'] },
    handler: (ctx) => {
      return ctx.ok({ user: ctx.user });
    },
  });

  return router;
}

export function requireAuth(secret: string): Middleware {
  return async (ctx, next) => {
    const authHeader = ctx.req.headers.get('authorization') || ctx.req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ctx.unauthorized('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7).trim();
    try {
      const payload = await verifyJWT(token, secret);
      ctx.user = payload;
      return next();
    } catch {
      return ctx.unauthorized('Invalid or expired token');
    }
  };
}
