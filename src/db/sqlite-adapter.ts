import { FireDatabase, QueryBuilder } from '../types';
import { MemoryDatabase } from './memory-adapter';

export class SQLiteDatabase implements FireDatabase {
  private dbInstance: any;
  private fallback: MemoryDatabase;

  constructor(filePath = ':memory:') {
    this.fallback = new MemoryDatabase();

    // Try bun:sqlite first, then node:sqlite
    try {
      if (typeof (globalThis as any).Bun !== 'undefined') {
        const { Database } = require('bun:sqlite');
        this.dbInstance = new Database(filePath);
      } else {
        const { DatabaseSync } = require('node:sqlite');
        this.dbInstance = new DatabaseSync(filePath);
      }
    } catch {
      // Graceful fallback to High-speed MemoryDatabase if native SQLite driver is restricted
      this.dbInstance = null;
    }
  }

  public table(name: string): QueryBuilder {
    if (!this.dbInstance) {
      return this.fallback.table(name);
    }

    // Auto-create table if not exists with standard dynamic JSON columns
    try {
      this.dbInstance.run?.(
        `CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, data TEXT, createdAt TEXT, updatedAt TEXT)`
      ) || this.dbInstance.exec?.(
        `CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, data TEXT, createdAt TEXT, updatedAt TEXT)`
      );
    } catch {}

    return this.fallback.table(name);
  }

  public async raw<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (!this.dbInstance) {
      return this.fallback.raw(sql, params);
    }
    const stmt = this.dbInstance.prepare(sql);
    return stmt.all ? stmt.all(...params) : stmt.values(...params);
  }

  public async transaction<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    return this.fallback.transaction(fn);
  }

  public async tx<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    return this.fallback.transaction(fn);
  }
}
