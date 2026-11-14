import { describe, expect, it } from 'bun:test';
import { createApp, s, FireMigrator, Migration } from '../src/index';

describe('FireAPI Schema Auto-Seeder & Migration Engine', () => {
  it('seeds database with schema-compliant mock data via app.db.seed()', async () => {
    const app = createApp({ database: { driver: 'memory' } });

    const BookSchema = s.object({
      title: s.string().min(5),
      author: s.string().min(3),
      price: s.number().min(10).max(500),
      inStock: s.boolean(),
    });

    // Seed 10 books
    const seeded = await app.db.seed('books', BookSchema, 10);
    expect(seeded.length).toBe(10);

    // Verify persisted rows in database
    const booksInDb = await app.db.books.find();
    expect(booksInDb.length).toBe(10);
    expect(booksInDb[0].title.length).toBeGreaterThanOrEqual(5);
    expect(typeof booksInDb[0].price).toBe('number');
  });

  it('runs migrations up and rolls back cleanly with FireMigrator', async () => {
    const app = createApp({ database: { driver: 'memory' } });
    const migrator = new FireMigrator(app.db);

    const migrations: Migration[] = [
      {
        name: '001_create_customers',
        up: async (db) => {
          await db.customers.insert({ id: 'c1', name: 'Initial Customer' });
        },
        down: async (db) => {
          await db.customers.delete('c1');
        },
      },
      {
        name: '002_create_orders',
        up: async (db) => {
          await db.orders.insert({ id: 'o1', customerId: 'c1', total: 100 });
        },
        down: async (db) => {
          await db.orders.delete('o1');
        },
      },
    ];

    // 1. Check initial status -> both pending
    const initialStatus = await migrator.status(migrations);
    expect(initialStatus.every((m) => m.status === 'pending')).toBe(true);

    // 2. Run migrations UP
    const upResult = await migrator.up(migrations);
    expect(upResult.applied.length).toBe(2);
    expect(upResult.applied).toEqual(['001_create_customers', '002_create_orders']);

    // Verify records created
    const customer = await app.db.customers.findById('c1');
    const order = await app.db.orders.findById('o1');
    expect(customer).not.toBeNull();
    expect(order).not.toBeNull();

    // Verify status -> both applied
    const appliedStatus = await migrator.status(migrations);
    expect(appliedStatus.every((m) => m.status === 'applied')).toBe(true);

    // 3. Rollback (DOWN)
    const downResult = await migrator.down(migrations);
    expect(downResult.rolledBack.length).toBe(2);

    // Verify rolled back
    const customerAfter = await app.db.customers.findById('c1');
    expect(customerAfter).toBeNull();
  });
});
