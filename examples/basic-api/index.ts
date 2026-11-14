import { createApp, createRouter, s, createAuth, enableStudio } from '../../src/index';

// 1. Initialize FireAPI Application
const app = createApp({
  port: 3000,
  database: {
    driver: 'memory',
    autoMock: true,
  },
  storage: {
    driver: 'memory',
    baseUrl: 'http://localhost:3000/uploads',
  },
  security: {
    rateLimit: { max: 100, window: '1m' },
    cors: true,
    headers: true,
  },
  docs: '/docs',
  openapiPath: '/openapi.json',
  metricsPath: '/metrics', // Standard Prometheus scraping endpoint
});

// 2. Turnkey Authentication & Embedded Dev Studio
app.use('/auth', createAuth({ jwtSecret: 'jwt-super-secret-key' }));
enableStudio(app, { path: '/studio' });

// 3. Background Job Worker & In-Process Typed Event Bus
app.queue.handle('send-email', async (data) => {
  console.log(`[Queue Worker] 📧 Sending email to ${data.to}: "${data.subject}"`);
});

app.on('order.*', async (order) => {
  console.log(`[Event Bus] 📡 Order event captured: total=$${order.total}`);
});

// 4. Lifecycle Interceptor Hook
app.hook('afterHandle', async (ctx, response) => {
  response.headers.set('X-Powered-By', 'FireAPI Engine');
  return response;
});

// 5. Scheduled Cron Task
app.cron('@hourly', async (appInstance) => {
  console.log('[FireCron] ⏰ Hourly background maintenance running...');
});

// 5. Define Book Validation Schema
const BookSchema = s.object({
  title: s.string().min(2).description('Title of the book'),
  author: s.string().min(2).description('Author name'),
  price: s.number().min(0).description('Price in USD'),
  category: s.enum(['tech', 'fiction', 'science']).default('tech'),
});

const bookRouter = createRouter('/books');

// GET /books - With route-level caching and eager-loaded relations
bookRouter.get('/', {
  cache: { ttl: 60, tags: ['books'] },
  ai: { description: 'Retrieve all books from the store', tags: ['Books'] },
  handler: async (ctx) => {
    return ctx.db.books.include('reviews').find();
  },
});

// POST /books/checkout - Idempotency Shield (Safe Replays with X-Idempotency-Key)
bookRouter.post('/checkout', {
  idempotent: true,
  handler: async (ctx) => {
    const order = await ctx.db.orders.insert({
      items: ctx.body.items,
      total: ctx.body.total,
      orderedAt: new Date().toISOString(),
    });
    return ctx.created(order);
  },
});

// POST /books/transfer - Atomic Transaction Scope with auto-rollback
bookRouter.post('/transfer', async (ctx) => {
  const result = await ctx.db.tx(async (trx) => {
    await trx.inventories.update(ctx.body.warehouseA, { stock: 10 });
    await trx.inventories.update(ctx.body.warehouseB, { stock: 90 });
    await trx.transfers.insert({ from: ctx.body.warehouseA, to: ctx.body.warehouseB, qty: 40 });
    return { success: true };
  });
  return ctx.ok(result);
});

// POST /webhooks/payment - Turnkey HMAC Webhook Verifier
bookRouter.post('/webhooks/payment', async (ctx) => {
  const valid = await ctx.webhook.verifyHMAC({
    secret: 'whsec_sample_secret_key',
  });
  if (!valid) return ctx.unauthorized('Invalid webhook signature');
  return ctx.ok({ received: true, event: ctx.body.event });
});

// POST /books - With validation, background email dispatch & cache invalidation
bookRouter.post('/', {
  schema: { body: BookSchema },
  ai: { description: 'Add a new book to the library', tags: ['Books'] },
  handler: async (ctx) => {
    const newBook = await ctx.db.books.insert(ctx.body);
    await ctx.cache.invalidate('books');

    // Dispatch background email without blocking the HTTP response
    await ctx.queue.dispatch('send-email', {
      to: 'admin@fire.dev',
      subject: `New book added: ${newBook.title}`,
    });

    return ctx.created(newBook);
  },
});

// DELETE /books/:id - Ultra-simple 1-line delete
bookRouter.delete('/:id', async (ctx) => {
  await ctx.db.books.delete(ctx.params.id);
  return { deleted: true };
});

// POST /books/cover - Universal Object Storage Upload
bookRouter.post('/cover', {
  ai: { description: 'Upload book cover image', tags: ['Storage'] },
  handler: async (ctx) => {
    const uploaded = await ctx.storage.put('covers/sample.png', 'fake_png_binary_data', {
      contentType: 'image/png',
    });
    return ctx.created(uploaded);
  },
});

// GET /books/stream/ai - Real-Time AI Token Streaming via Server-Sent Events (SSE)
bookRouter.get('/stream/ai', {
  ai: { description: 'Simulate streaming AI thoughts token-by-token', tags: ['AI'] },
  handler: (ctx) => {
    return ctx.stream.sse(async (stream) => {
      const tokens = ['FireAPI', 'is', 'the', 'fastest', 'modern', 'TypeScript', 'framework!'];
      for (const token of tokens) {
        await stream.send(token, { event: 'token' });
        await new Promise((r) => setTimeout(r, 100)); // Simulate LLM latency
      }
      await stream.send('[DONE]', { event: 'done' });
      stream.close();
    });
  },
});

// 6. Native Real-Time WebSockets with Rooms
app.ws('/chat/:room', {
  open(ws, ctx) {
    ws.join(ctx.params.room);
    ws.publish(ctx.params.room, { notice: `User connected to room ${ctx.params.room}` });
  },
  message(ws, msg, ctx) {
    ws.publish(ctx.params.room, { message: msg });
  },
});

// 7. Mount Router & Enable Model Context Protocol (MCP) for AI Agents
app.use(bookRouter);
app.enableMCP({ name: 'BookStoreMCP', version: '1.0.0' });

// 8. Start Server
console.log('🔥 FireAPI server launching at http://localhost:3000');
console.log('🖥️ FireStudio Dashboard: http://localhost:3000/studio');
console.log('📖 Interactive Scalar API Docs: http://localhost:3000/docs');
console.log('📊 Prometheus Metrics: http://localhost:3000/metrics');
console.log('⚡ OpenAPI 3.1 Spec: http://localhost:3000/openapi.json');
console.log('🤖 MCP AI Endpoint: http://localhost:3000/mcp');

app.listen(3000);

export type AppRouter = typeof app;
export default app;
