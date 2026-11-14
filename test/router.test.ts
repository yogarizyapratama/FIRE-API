import { describe, expect, it } from 'bun:test';
import { Router } from '../src/core/router';

describe('FireAPI Core Router', () => {
  it('registers and matches static routes', () => {
    const router = new Router();
    router.get('/health', {
      handler: (ctx) => ctx.json({ status: 'ok' }),
    });

    const match = router.match('GET', '/health');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({});
  });

  it('matches routes with dynamic path parameters', () => {
    const router = new Router();
    router.get('/users/:id', {
      handler: (ctx) => ctx.json({ id: ctx.params.id }),
    });

    const match = router.match('GET', '/users/usr_123');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: 'usr_123' });
  });

  it('matches nested routes with multiple parameters', () => {
    const router = new Router();
    router.get('/orgs/:orgId/members/:memberId', {
      handler: (ctx) => ctx.json({}),
    });

    const match = router.match('GET', '/orgs/google/members/42');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ orgId: 'google', memberId: '42' });
  });

  it('handles wildcards (*)', () => {
    const router = new Router();
    router.get('/assets/*', {
      handler: (ctx) => ctx.text('asset'),
    });

    const match = router.match('GET', '/assets/css/style.css');
    expect(match).not.toBeNull();
    expect(match?.params['*']).toBe('css/style.css');
  });

  it('differentiates HTTP methods', () => {
    const router = new Router();
    router.get('/items', { handler: () => 'get' });
    router.post('/items', { handler: () => 'post' });

    const getMatch = router.match('GET', '/items');
    const postMatch = router.match('POST', '/items');
    const putMatch = router.match('PUT', '/items');

    expect(getMatch).not.toBeNull();
    expect(postMatch).not.toBeNull();
    expect(putMatch).toBeNull();
  });

  it('supports prefix-based sub-router mounting', () => {
    const rootRouter = new Router();
    const apiRouter = new Router();
    const userRouter = new Router();

    userRouter.get('/:id', { handler: () => 'user' });
    apiRouter.use('/users', userRouter);
    rootRouter.use('/api/v1', apiRouter);

    const match = rootRouter.match('GET', '/api/v1/users/777');
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: '777' });
  });

  it('normalizes trailing slashes properly', () => {
    const router = new Router();
    router.get('/dashboard', { handler: () => 'dash' });

    expect(router.match('GET', '/dashboard/')).not.toBeNull();
    expect(router.match('GET', '/dashboard')).not.toBeNull();
  });
});
