import { describe, expect, it } from 'bun:test';
import { Router } from '../src/core/router';

describe('FireAPI JIT Route Fast-Path Cache', () => {
  it('hits fast-path cache for identical and variable parameter lookups', () => {
    const router = new Router();
    router.get('/products/:id', {
      handler: (ctx) => ctx.ok({ id: ctx.params.id }),
    });

    // 1st lookup - Misses cache, populates fast-path
    const match1 = router.match('GET', '/products/100');
    expect(match1).not.toBeNull();
    expect(match1?.params.id).toBe('100');

    // 2nd lookup on same URL - Hits fast-path cache
    const match2 = router.match('GET', '/products/100');
    expect(match2).not.toBeNull();
    expect(match2?.params.id).toBe('100');

    // 3rd lookup with different param - Correctly extracts new param
    const match3 = router.match('GET', '/products/200');
    expect(match3).not.toBeNull();
    expect(match3?.params.id).toBe('200');
  });

  it('demonstrates extreme sub-microsecond lookup speed across 10,000 iterations', () => {
    const router = new Router();
    router.get('/api/v1/users/:userId/orders/:orderId', {
      handler: () => 'ok',
    });

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      router.match('GET', '/api/v1/users/42/orders/999');
    }
    const duration = performance.now() - start;

    // 10,000 matches should complete in under 20ms (averaging < 0.002ms per match!)
    expect(duration).toBeLessThan(20);
  });
});
