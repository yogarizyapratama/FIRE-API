import { describe, expect, it } from 'bun:test';
import { createContext } from '../src/core/context';
import { HttpError } from '../src/core/error';

describe('FireAPI FireContext & Error Handling', () => {
  it('parses URL, query parameters and route parameters', () => {
    const req = new Request('http://localhost:3000/users/42?filter=active&sort=desc');
    const ctx = createContext({
      req,
      params: { id: '42' },
    });

    expect(ctx.params.id).toBe('42');
    expect(ctx.query.filter).toBe('active');
    expect(ctx.query.sort).toBe('desc');
  });

  it('produces standard JSON responses with status codes', async () => {
    const req = new Request('http://localhost:3000/items');
    const ctx = createContext({ req });

    const okRes = ctx.ok({ success: true });
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ success: true });

    const createdRes = ctx.created({ id: 'new_1' });
    expect(createdRes.status).toBe(201);
    expect(await createdRes.json()).toEqual({ id: 'new_1' });

    const notFoundRes = ctx.notFound('Item not found');
    expect(notFoundRes.status).toBe(404);
    expect(await notFoundRes.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Item not found',
    });
  });

  it('supports custom HttpError throwing and serialization', () => {
    const err = new HttpError(400, 'Invalid payload', { field: 'email' });
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid payload');
    expect(err.details).toEqual({ field: 'email' });

    const response = err.toResponse();
    expect(response.status).toBe(400);
  });
});
