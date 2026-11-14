import { describe, expect, it } from 'bun:test';
import { createApp, createRouter } from '../src/index';

describe('FireAPI Ultra-Simple Relational Proxy ORM (.include())', () => {
  it('eager-loads one-to-many relations using ctx.db.users.include("posts").findById(id)', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const router = createRouter();

    // 1. Seed data
    const user = await app.db.users.insert({ id: 'u100', name: 'Devin', role: 'admin' });
    await app.db.posts.insert([
      { id: 'p1', userId: 'u100', title: 'First Post', published: true },
      { id: 'p2', userId: 'u100', title: 'Second Post', published: false },
      { id: 'p3', userId: 'other_user', title: 'Unrelated Post', published: true },
    ]);

    router.get('/users/:id', async (ctx) => {
      const result = await ctx.db.users.include('posts').findById(ctx.params.id);
      if (!result) return ctx.notFound('User not found');
      return ctx.ok(result);
    });

    app.use(router);

    const res = await app.handle(
      new Request('http://localhost:3000/users/u100', { method: 'GET' })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('u100');
    expect(data.name).toBe('Devin');
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts.length).toBe(2);
    expect(data.posts[0].title).toBe('First Post');
    expect(data.posts[1].title).toBe('Second Post');
  });

  it('eager-loads many-to-one parent relations using ctx.db.posts.include("user").findById(id)', async () => {
    const app = createApp({ database: { driver: 'memory' } });

    await app.db.users.insert({ id: 'u200', name: 'Grace Hopper' });
    await app.db.posts.insert({ id: 'p50', userId: 'u200', title: 'Compilers in Practice' });

    const post = await app.db.posts.include('user').findById('p50');

    expect(post).not.toBeNull();
    expect(post.title).toBe('Compilers in Practice');
    expect(post.user).toBeDefined();
    expect(post.user.name).toBe('Grace Hopper');
    expect(post.user.id).toBe('u200');
  });

  it('eager-loads multiple relations across array results using .include(["posts", "profile"]).find()', async () => {
    const app = createApp({ database: { driver: 'memory' } });

    await app.db.users.insert([
      { id: 'u1', name: 'User One' },
      { id: 'u2', name: 'User Two' },
    ]);

    await app.db.posts.insert([
      { id: 'p1', userId: 'u1', title: 'U1 Post' },
      { id: 'p2', userId: 'u2', title: 'U2 Post' },
    ]);

    await app.db.profiles.insert([
      { id: 'prof1', userId: 'u1', bio: 'Bio 1' },
      { id: 'prof2', userId: 'u2', bio: 'Bio 2' },
    ]);

    const users = await app.db.users.include(['posts', 'profile']).find();

    expect(users.length).toBe(2);
    expect(users[0].posts.length).toBe(1);
    expect(users[0].posts[0].title).toBe('U1 Post');
    expect(users[0].profile).toBeDefined();
    expect(users[0].profile.bio).toBe('Bio 1');

    expect(users[1].posts.length).toBe(1);
    expect(users[1].posts[0].title).toBe('U2 Post');
    expect(users[1].profile).toBeDefined();
    expect(users[1].profile.bio).toBe('Bio 2');
  });
});
