import { FireDatabase, QueryBuilder } from '../types';
import { WhereClause } from './db-interface';
import { MemoryDatabase } from './memory-adapter';

const TABLE_SCHEMA = `(id TEXT PRIMARY KEY, data TEXT, createdAt TEXT, updatedAt TEXT)`;

function runSql(db: any, sql: string): void {
  if (typeof db.exec === 'function') {
    db.exec(sql);
  } else if (typeof db.run === 'function') {
    db.run(sql);
  }
}

class SQLiteQueryBuilder implements QueryBuilder {
  private clauses: WhereClause[] = [];
  private limitCount?: number;
  private offsetCount = 0;
  private orderField?: string;
  private orderDir: 'asc' | 'desc' = 'asc';

  constructor(private db: any, private tableName: string) {}

  public where(field: string, operatorOrValue: any, value?: any): QueryBuilder {
    if (value === undefined) {
      this.clauses.push({ field, operator: '=', value: operatorOrValue });
    } else {
      this.clauses.push({ field, operator: operatorOrValue, value });
    }
    return this;
  }

  public limit(count: number): QueryBuilder {
    this.limitCount = count;
    return this;
  }

  public offset(count: number): QueryBuilder {
    this.offsetCount = count;
    return this;
  }

  public orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder {
    this.orderField = field;
    this.orderDir = direction;
    return this;
  }

  public include(_relation: string | string[]): QueryBuilder {
    return this;
  }

  private loadAll(): Record<string, any>[] {
    const stmt = this.db.prepare(`SELECT * FROM "${this.tableName}"`);
    const rows = stmt.all ? stmt.all() : [];
    return rows.map((r: any) => {
      let data: any = {};
      try {
        data = JSON.parse(r.data ?? '{}');
      } catch {
        data = {};
      }
      return { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, ...data };
    });
  }

  private persistRow(row: Record<string, any>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO "${this.tableName}" (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?)`
      )
      .run(String(row.id), JSON.stringify(row), row.createdAt, row.updatedAt);
  }

  private filterRows(): Record<string, any>[] {
    let rows = this.loadAll();

    for (const clause of this.clauses) {
      rows = rows.filter((row) => {
        const val = row[clause.field];
        switch (clause.operator) {
          case '=': return val === clause.value;
          case '!=': return val !== clause.value;
          case '>': return val > clause.value;
          case '>=': return val >= clause.value;
          case '<': return val < clause.value;
          case '<=': return val <= clause.value;
          case 'in': return Array.isArray(clause.value) && clause.value.includes(val);
          case 'like':
            return typeof val === 'string' &&
              val.toLowerCase().includes(String(clause.value).toLowerCase().replace(/%/g, ''));
          default: return val === clause.value;
        }
      });
    }

    if (this.orderField) {
      const field = this.orderField;
      const factor = this.orderDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (a[field] < b[field]) return -1 * factor;
        if (a[field] > b[field]) return 1 * factor;
        return 0;
      });
    }

    if (this.offsetCount > 0) {
      rows = rows.slice(this.offsetCount);
    }
    if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  public async find<T = any>(): Promise<T[]> {
    return this.filterRows() as T[];
  }

  public async findOne<T = any>(): Promise<T | null> {
    const rows = this.filterRows();
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  public async findById<T = any>(id: string | number): Promise<T | null> {
    const rows = this.loadAll().filter((r) => String(r.id) === String(id));
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  public async insert<T = any>(data: Record<string, any> | Record<string, any>[]): Promise<T> {
    if (Array.isArray(data)) {
      const inserted = data.map((item, idx) => {
        const id = item.id ?? `sqlite_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
        const createdAt = item.createdAt ?? new Date().toISOString();
        const row = { ...item, id, createdAt, updatedAt: item.updatedAt ?? createdAt };
        this.persistRow(row);
        return row;
      });
      return inserted as any;
    }

    const id = data.id ?? `sqlite_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = data.createdAt ?? new Date().toISOString();
    const row = { ...data, id, createdAt, updatedAt: data.updatedAt ?? createdAt };
    this.persistRow(row);
    return row as any;
  }

  public async update<T = any>(data: Record<string, any>): Promise<T> {
    const targets = this.filterRows();
    if (targets.length === 0) return null as any;

    let lastUpdated: any = null;
    for (const target of targets) {
      const merged = { ...target, ...data, updatedAt: new Date().toISOString() };
      this.persistRow(merged);
      lastUpdated = merged;
    }
    return lastUpdated as T;
  }

  public async delete(): Promise<{ count: number }> {
    const targets = this.filterRows();
    const stmt = this.db.prepare(`DELETE FROM "${this.tableName}" WHERE id = ?`);
    for (const target of targets) {
      stmt.run(String(target.id));
    }
    return { count: targets.length };
  }
}

export class SQLiteDatabase implements FireDatabase {
  private db: any;
  private fallback = new MemoryDatabase();

  constructor(filePath = ':memory:') {
    try {
      if (typeof (globalThis as any).Bun !== 'undefined') {
        const { Database } = require('bun:sqlite');
        this.db = new Database(filePath);
      } else {
        const { DatabaseSync } = require('node:sqlite');
        this.db = new DatabaseSync(filePath);
      }
    } catch {
      // Fallback to in-memory only if native SQLite driver is unavailable
      this.db = null;
    }
  }

  public table(name: string): QueryBuilder {
    if (!this.db) return this.fallback.table(name);

    try {
      runSql(this.db, `CREATE TABLE IF NOT EXISTS "${name}" ${TABLE_SCHEMA}`);
    } catch {
      // Table may already exist with a different schema; proceed with SELECT
    }
    return new SQLiteQueryBuilder(this.db, name);
  }

  public async raw<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (!this.db) return this.fallback.raw(sql, params);
    const stmt = this.db.prepare(sql);
    return stmt.all ? stmt.all(...params) : stmt.values(...params);
  }

  public async transaction<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    if (!this.db) return this.fallback.transaction(fn);

    try {
      runSql(this.db, 'BEGIN');
      const result = await fn(this);
      runSql(this.db, 'COMMIT');
      return result;
    } catch (err) {
      try {
        runSql(this.db, 'ROLLBACK');
      } catch {}
      throw err;
    }
  }

  public async tx<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    return this.transaction(fn);
  }
}
