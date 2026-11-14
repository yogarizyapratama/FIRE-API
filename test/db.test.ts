import { describe, expect, it } from 'bun:test';
import { MemoryDatabase } from '../src/db/memory-adapter';
import { createDatabaseHub } from '../src/db/hub';

describe('FireAPI FireDB Universal Hub & Memory Adapter', () => {
  it('supports insert, find, findById, and where filtering', async () => {
    const db = new MemoryDatabase();

    const inserted = await db.table('users').insert({
      name: 'Yoga',
      email: 'yoga@fire.dev',
      role: 'admin',
    });

    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe('Yoga');

    const users = await db.table('users').where('role', 'admin').find();
    expect(users.length).toBe(1);
    expect(users[0].email).toBe('yoga@fire.dev');

    const userById = await db.table('users').findById(inserted.id);
    expect(userById?.name).toBe('Yoga');
  });

  it('supports update and delete operations', async () => {
    const db = new MemoryDatabase();

    const item = await db.table('products').insert({ title: 'MacBook', price: 2000 });
    
    // Update
    const updated = await db.table('products').where('id', item.id).update({ price: 1800 });
    expect(updated.price).toBe(1800);

    // Delete
    const deleted = await db.table('products').where('id', item.id).delete();
    expect(deleted.count).toBe(1);

    const remaining = await db.table('products').find();
    expect(remaining.length).toBe(0);
  });

  it('supports transactions in memory adapter', async () => {
    const db = new MemoryDatabase();

    await db.transaction(async (trx) => {
      await trx.table('logs').insert({ action: 'audit_start' });
      await trx.table('logs').insert({ action: 'audit_end' });
    });

    const logs = await db.table('logs').find();
    expect(logs.length).toBe(2);
  });

  it('initializes seamlessly via createDatabaseHub', async () => {
    const hub = createDatabaseHub({ driver: 'memory', autoMock: true });
    expect(hub).toBeDefined();

    const res = await hub.table('test').insert({ status: 'ready' });
    expect(res.status).toBe('ready');
  });
});
