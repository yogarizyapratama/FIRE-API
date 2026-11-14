import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/index';

describe('FireAPI Ultra-Simple Proxy ORM Shortcuts', () => {
  it('supports direct table property access: ctx.db.products.delete(id)', async () => {
    const app = createApp({ database: { driver: 'memory' } });

    // 1. Insert via shortcut: ctx.db.products.insert(...)
    const product = await app.db.products.insert({
      title: 'Gaming Mouse',
      price: 50,
      category: 'hardware',
    });
    expect(product.id).toBeDefined();
    expect(product.title).toBe('Gaming Mouse');

    // 2. Find by ID via shortcut: ctx.db.products.findById(id)
    const found = await app.db.products.findById(product.id);
    expect(found?.title).toBe('Gaming Mouse');

    // 3. Find with object filter: ctx.db.products.find({ category: 'hardware' })
    const hardwares = await app.db.products.find({ category: 'hardware' });
    expect(hardwares.length).toBe(1);

    // 4. Update by ID via shortcut: ctx.db.products.update(id, data)
    const updated = await app.db.products.update(product.id, { price: 45 });
    expect(updated.price).toBe(45);

    // 5. Delete by ID via shortcut: ctx.db.products.delete(id)
    const deleteResult = await app.db.products.delete(product.id);
    expect(deleteResult.count).toBe(1);

    // Verify deleted
    const remaining = await app.db.products.findById(product.id);
    expect(remaining).toBeNull();
  });

  it('supports delete by filter object: ctx.db.products.delete({ category: "old" })', async () => {
    const app = createApp({ database: { driver: 'memory' } });

    await app.db.items.insert({ title: 'Item 1', status: 'archived' });
    await app.db.items.insert({ title: 'Item 2', status: 'archived' });
    await app.db.items.insert({ title: 'Item 3', status: 'active' });

    const del = await app.db.items.delete({ status: 'archived' });
    expect(del.count).toBe(2);

    const activeList = await app.db.items.find();
    expect(activeList.length).toBe(1);
    expect(activeList[0].status).toBe('active');
  });
});
