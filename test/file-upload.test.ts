import { describe, expect, it } from 'bun:test';
import { createApp, createRouter, s } from '../src/index';

describe('FireAPI Native Multipart & File Upload Shield (s.file, ctx.files)', () => {
  it('parses multipart/form-data and stores uploaded files via ctx.files.*.store()', async () => {
    const app = createApp({
      storage: { driver: 'memory' },
    });
    const router = createRouter();

    const UploadSchema = s.object({
      title: s.string().min(2),
      avatar: s.file({
        maxSize: '2MB',
        types: ['image/png', 'image/jpeg'],
      }),
    });

    router.post('/upload', {
      schema: { body: UploadSchema },
      handler: async (ctx) => {
        const stored = await ctx.files.avatar.store('avatars');
        return ctx.created({
          title: ctx.body.title,
          fileName: ctx.files.avatar.name,
          fileSize: ctx.files.avatar.size,
          url: stored.url,
        });
      },
    });

    app.use(router);

    // Create a real FormData
    const formData = new FormData();
    formData.append('title', 'My Profile Photo');
    const fakeFile = new File(['fake-png-binary-content-12345'], 'profile.png', { type: 'image/png' });
    formData.append('avatar', fakeFile);

    const res = await app.handle(
      new Request('http://localhost:3000/upload', {
        method: 'POST',
        body: formData,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('My Profile Photo');
    expect(body.fileName).toBe('profile.png');
    expect(body.fileSize).toBeGreaterThan(0);
    expect(body.url).toContain('/uploads/avatars/');
  });

  it('rejects files exceeding maxSize with 400 validation error', async () => {
    const app = createApp();
    const router = createRouter();

    router.post('/upload-strict', {
      schema: {
        body: s.object({
          doc: s.file({ maxSize: '10B' }), // Tiny limit: 10 bytes!
        }),
      },
      handler: async (ctx) => ctx.ok({ success: true }),
    });

    app.use(router);

    const formData = new FormData();
    const largeFile = new File(['This file is definitely longer than 10 bytes'], 'big.txt', { type: 'text/plain' });
    formData.append('doc', largeFile);

    const res = await app.handle(
      new Request('http://localhost:3000/upload-strict', {
        method: 'POST',
        body: formData,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation Error');
  });

  it('rejects forbidden file types with 400 validation error', async () => {
    const app = createApp();
    const router = createRouter();

    router.post('/upload-images-only', {
      schema: {
        body: s.object({
          image: s.file({ types: ['image/png', 'image/jpeg'] }),
        }),
      },
      handler: async (ctx) => ctx.ok({ success: true }),
    });

    app.use(router);

    const formData = new FormData();
    const exeFile = new File(['malicious-binary'], 'malware.exe', { type: 'application/x-msdownload' });
    formData.append('image', exeFile);

    const res = await app.handle(
      new Request('http://localhost:3000/upload-images-only', {
        method: 'POST',
        body: formData,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Validation Error');
  });
});
