import { describe, expect, it } from 'bun:test';
import { MemoryCacheManager } from '../src/cache/cache';

describe('FireAPI FireCache SWR Engine', () => {
  it('stores and retrieves cached values with TTL', async () => {
    const cache = new MemoryCacheManager();
    await cache.set('user:1', { name: 'Yoga' }, 10); // 10 seconds

    const item = await cache.get('user:1');
    expect(item).toEqual({ name: 'Yoga' });
  });

  it('expires items when TTL has elapsed', async () => {
    const cache = new MemoryCacheManager();
    // Expire immediately (0.01s)
    await cache.set('temp', 'gone_soon', 0.01);

    await new Promise((r) => setTimeout(r, 20));
    const item = await cache.get('temp');
    expect(item).toBeNull();
  });

  it('invalidates cache entries by tags', async () => {
    const cache = new MemoryCacheManager();
    await cache.set('post:1', { title: 'First Post' }, 60, ['posts', 'author:1']);
    await cache.set('post:2', { title: 'Second Post' }, 60, ['posts', 'author:2']);
    await cache.set('user:1', { name: 'Author One' }, 60, ['users']);

    // Invalidate 'posts' tag
    await cache.invalidate('posts');

    expect(await cache.get('post:1')).toBeNull();
    expect(await cache.get('post:2')).toBeNull();
    expect(await cache.get('user:1')).toEqual({ name: 'Author One' }); // untouched!
  });
});
