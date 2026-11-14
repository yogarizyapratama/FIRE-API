import { describe, expect, it } from 'bun:test';
import { createClient } from '../src/client';

describe('FireAPI FireClient E2E Type-Safe RPC', () => {
  it('constructs correct HTTP requests from proxy path calls', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedMethod = init?.method || 'GET';
      capturedBody = init?.body ? String(init.body) : '';
      return new Response(JSON.stringify({ ok: true, id: '123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = createClient('http://localhost:3000', { fetch: mockFetch });

    // Call GET /api/v1/health
    const res1 = await client.api.v1.health.get();
    expect(capturedUrl).toBe('http://localhost:3000/api/v1/health');
    expect(capturedMethod).toBe('GET');
    expect(res1.ok).toBe(true);
    expect(res1.data).toEqual({ ok: true, id: '123' });

    // Call POST /users with body
    const res2 = await client.users.post({
      body: { name: 'Alice', email: 'alice@fire.dev' },
    });
    expect(capturedUrl).toBe('http://localhost:3000/users');
    expect(capturedMethod).toBe('POST');
    expect(JSON.parse(capturedBody)).toEqual({ name: 'Alice', email: 'alice@fire.dev' });

    // Call GET /users/:id with params substitution
    await client.users[':id'].get({ params: { id: 'usr_99' } });
    expect(capturedUrl).toBe('http://localhost:3000/users/usr_99');
  });

  it('handles query parameters accurately', async () => {
    let capturedUrl = '';
    const mockFetch = async (input: RequestInfo | URL) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify([]));
    };

    const client = createClient('http://localhost:3000', { fetch: mockFetch });
    await client.posts.get({ query: { page: '2', limit: '10' } });

    expect(capturedUrl).toBe('http://localhost:3000/posts?page=2&limit=10');
  });
});
