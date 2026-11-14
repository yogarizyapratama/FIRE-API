import { createRouter } from '../../index';
import { CreateProductSchema, ProductIdSchema } from './product.schema';

export const productRouter = createRouter('/products');

// GET /products
productRouter.get('/', {
  cache: { ttl: 60, tags: ['products'] },
  ai: { description: 'Fetch list of products', tags: ['Product'] },
  handler: async (ctx) => {
    const items = await ctx.db.table('products').find();
    return ctx.ok(items);
  },
});

// POST /products
productRouter.post('/', {
  schema: { body: CreateProductSchema },
  ai: { description: 'Create a new product', tags: ['Product'] },
  handler: async (ctx) => {
    const created = await ctx.db.table('products').insert(ctx.body);
    await ctx.cache.invalidate('products');
    return ctx.created(created);
  },
});

// GET /products/:id
productRouter.get('/:id', {
  schema: { params: ProductIdSchema },
  ai: { description: 'Get a product by unique ID', tags: ['Product'] },
  handler: async (ctx) => {
    const item = await ctx.db.table('products').findById(ctx.params.id);
    if (!item) return ctx.notFound('Product not found');
    return ctx.ok(item);
  },
});
