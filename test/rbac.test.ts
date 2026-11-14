import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Granular RBAC & Policy Gates', () => {
  it('enforces role requirements (roles: ["admin"]) and blocks unauthorized roles with 403', async () => {
    const app = createApp();
    const router = createRouter('/admin');

    // Attach user to context for simulation
    const setRole = (role: string) => async (ctx: any, next: any) => {
      ctx.user = { id: 'u1', role };
      return next();
    };

    router.get('/dashboard', {
      roles: ['admin', 'superadmin'],
      handler: (ctx) => ctx.ok({ secret: 'admin-portal' }),
    });

    app.use(router);

    // 1. User with 'member' role -> 403 Forbidden
    const memberApp = createApp();
    memberApp.use(setRole('member'));
    memberApp.use(router);

    const forbiddenRes = await memberApp.handle(new Request('http://localhost:3000/admin/dashboard'));
    expect(forbiddenRes.status).toBe(403);
    const errData = await forbiddenRes.json();
    expect(errData.error).toBe('Forbidden');

    // 2. User with 'admin' role -> 200 OK
    const adminApp = createApp();
    adminApp.use(setRole('admin'));
    adminApp.use(router);

    const okRes = await adminApp.handle(new Request('http://localhost:3000/admin/dashboard'));
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).secret).toBe('admin-portal');
  });

  it('evaluates dynamic resource policy gates (can: async (user, ctx) => boolean)', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    await app.db.table('articles').insert({ id: 'art_1', authorId: 'author_123', title: 'Post 1' });

    const router = createRouter('/articles');

    router.delete('/:id', {
      can: async (user, ctx) => {
        const article = await ctx.db.table('articles').findById(ctx.params.id);
        return user?.id === article?.authorId || user?.role === 'admin';
      },
      handler: async (ctx) => {
        await ctx.db.table('articles').where('id', ctx.params.id).delete();
        return ctx.ok({ deleted: true });
      },
    });

    app.use(router);

    // 1. Other user trying to delete -> 403 Forbidden
    const unauthApp = createApp();
    unauthApp.db = app.db;
    unauthApp.use(async (ctx, next) => {
      ctx.user = { id: 'other_user', role: 'member' };
      return next();
    });
    unauthApp.use(router);

    const failRes = await unauthApp.handle(new Request('http://localhost:3000/articles/art_1', { method: 'DELETE' }));
    expect(failRes.status).toBe(403);

    // 2. Author user deleting own article -> 200 OK
    const authorApp = createApp();
    authorApp.db = app.db;
    authorApp.use(async (ctx, next) => {
      ctx.user = { id: 'author_123', role: 'member' };
      return next();
    });
    authorApp.use(router);

    const successRes = await authorApp.handle(new Request('http://localhost:3000/articles/art_1', { method: 'DELETE' }));
    expect(successRes.status).toBe(200);
  });
});
