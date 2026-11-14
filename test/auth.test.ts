import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from '../src/auth/crypto';
import { signJWT, verifyJWT } from '../src/auth/jwt';
import { createAuth, requireAuth } from '../src/auth/auth';
import { createApp } from '../src/core/app';

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer as any))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Reproduces the pre-v1.0.4 "salt:hash" format (PBKDF2 100k) for migration tests
async function legacyHash(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `${toHex(salt)}:${toHex(derived)}`;
}

describe('FireAPI Turnkey Auth Module (fire-api/auth)', () => {
  it('hashes and verifies passwords securely using Web Crypto', async () => {
    const rawPassword = 'SuperSecretPassword123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toContain('pbkdf2_sha256$'); // versioned format
    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('still verifies legacy 100k-iteration "salt:hash" passwords', async () => {
    const rawPassword = 'LegacyPassword123!';
    const oldHash = await legacyHash(rawPassword);

    expect(oldHash).toContain(':');
    expect(await verifyPassword(rawPassword, oldHash)).toBe(true);
    expect(await verifyPassword('WrongPassword', oldHash)).toBe(false);
    expect(await verifyPassword(rawPassword, oldHash + 'ff')).toBe(false);
  });

  it('signs and verifies JWT tokens with expiration', async () => {
    const secret = 'test-secret-key-super-safe';
    const payload = { userId: 'usr_1', role: 'admin' };

    const token = await signJWT(payload, secret, 3600); // 1 hour
    expect(token.split('.').length).toBe(3);

    const decoded = await verifyJWT<{ userId: string; role: string }>(token, secret);
    expect(decoded.userId).toBe('usr_1');
    expect(decoded.role).toBe('admin');
  });

  it('provides turnkey register and login routes', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const authRouter = createAuth({ jwtSecret: 'jwt-super-secret' });
    app.use('/auth', authRouter);

    // 1. Test Register
    const regRes = await app.handle(
      new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'yoga@fire.dev',
          password: 'Password123!',
          name: 'Yoga',
        }),
      })
    );

    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.user.email).toBe('yoga@fire.dev');
    expect(regData.token).toBeDefined();

    // 2. Test Login (Success)
    const loginRes = await app.handle(
      new Request('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'yoga@fire.dev',
          password: 'Password123!',
        }),
      })
    );

    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.token).toBeDefined();

    // 3. Test Login (Invalid password)
    const failRes = await app.handle(
      new Request('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'yoga@fire.dev',
          password: 'WrongPassword',
        }),
      })
    );

    expect(failRes.status).toBe(401);
  });

  it('enforces route protection with requireAuth guard', async () => {
    const app = createApp();
    const secret = 'jwt-guard-secret';

    app.get('/protected', {
      middlewares: [requireAuth(secret)],
      handler: (ctx) => ctx.ok({ secretData: 'access granted', user: ctx.user }),
    });

    // Without token -> 401
    const unauthRes = await app.handle(new Request('http://localhost:3000/protected'));
    expect(unauthRes.status).toBe(401);

    // With valid token -> 200
    const token = await signJWT({ id: 'u1', name: 'Dev' }, secret);
    const authRes = await app.handle(
      new Request('http://localhost:3000/protected', {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(authRes.status).toBe(200);
    const data = await authRes.json();
    expect(data.secretData).toBe('access granted');
    expect(data.user.id).toBe('u1');
  });
});
