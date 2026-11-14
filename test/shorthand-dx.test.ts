import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/index';

describe('FireAPI Ultra-Simple Shorthand DX', () => {
  it('allows direct handler function without options wrapper', async () => {
    const app = createApp();

    // 1. Return raw string
    app.get('/hello', () => 'Hello FireAPI!');

    // 2. Return raw object (auto 200 JSON)
    app.get('/data', () => ({ status: 'success', count: 42 }));

    // 3. Return from ctx.db directly
    app.get('/users', async (ctx) => {
      return [{ id: '1', name: 'Yoga' }];
    });

    const res1 = await app.handle(new Request('http://localhost:3000/hello'));
    expect(res1.status).toBe(200);
    expect(await res1.text()).toBe('Hello FireAPI!');

    const res2 = await app.handle(new Request('http://localhost:3000/data'));
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ status: 'success', count: 42 });

    const res3 = await app.handle(new Request('http://localhost:3000/users'));
    expect(res3.status).toBe(200);
    expect(await res3.json()).toEqual([{ id: '1', name: 'Yoga' }]);
  });
});
