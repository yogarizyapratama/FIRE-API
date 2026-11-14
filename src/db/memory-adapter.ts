import { FireDatabase, QueryBuilder } from '../types';
import { WhereClause } from './db-interface';

export class MemoryQueryBuilder implements QueryBuilder {
  private clauses: WhereClause[] = [];
  private limitCount?: number;
  private offsetCount = 0;
  private orderField?: string;
  private orderDir: 'asc' | 'desc' = 'asc';

  constructor(private storage: Map<string, Record<string, any>[]>, private tableName: string) {}

  private getTableData(): Record<string, any>[] {
    if (!this.storage.has(this.tableName)) {
      this.storage.set(this.tableName, []);
    }
    return this.storage.get(this.tableName)!;
  }

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

  private filterRows(): Record<string, any>[] {
    let rows = [...this.getTableData()];

    // Apply where clauses
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

    // Apply order
    if (this.orderField) {
      const field = this.orderField;
      const factor = this.orderDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (a[field] < b[field]) return -1 * factor;
        if (a[field] > b[field]) return 1 * factor;
        return 0;
      });
    }

    // Apply pagination
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
    const rows = this.getTableData().filter((r) => String(r.id) === String(id));
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  public async insert<T = any>(data: Record<string, any> | Record<string, any>[]): Promise<T> {
    const table = this.getTableData();
    if (Array.isArray(data)) {
      const insertedList = data.map((item, idx) => ({
        ...item,
        id: item.id || `mem_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      }));
      table.push(...insertedList);
      return insertedList as any;
    } else {
      const inserted = {
        ...data,
        id: data.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };
      table.push(inserted);
      return inserted as any;
    }
  }

  public async update<T = any>(data: Record<string, any>): Promise<T> {
    const targetRows = this.filterRows();
    if (targetRows.length === 0) {
      return null as any;
    }

    const table = this.getTableData();
    let lastUpdated: any = null;

    for (const target of targetRows) {
      const idx = table.findIndex((r) => r.id === target.id);
      if (idx !== -1) {
        table[idx] = {
          ...table[idx],
          ...data,
          updatedAt: new Date().toISOString(),
        };
        lastUpdated = table[idx];
      }
    }

    return lastUpdated as T;
  }

  public async delete(): Promise<{ count: number }> {
    const targetRows = this.filterRows();
    const table = this.getTableData();
    const targetIds = new Set(targetRows.map((r) => r.id));

    const remaining = table.filter((r) => !targetIds.has(r.id));
    this.storage.set(this.tableName, remaining);

    return { count: targetRows.length };
  }
}

export class MemoryDatabase implements FireDatabase {
  private storage: Map<string, Record<string, any>[]> = new Map();

  public table(name: string): QueryBuilder {
    return new MemoryQueryBuilder(this.storage, name);
  }

  public async raw<T = any>(_sql: string, _params?: any[]): Promise<T> {
    return [] as any;
  }

  public async transaction<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    // Deep snapshot of current storage for automatic rollback
    const snapshot = new Map<string, Record<string, any>[]>();
    for (const [table, rows] of this.storage.entries()) {
      snapshot.set(table, rows.map((r) => ({ ...r })));
    }

    try {
      return await fn(this);
    } catch (err) {
      // Rollback on any thrown error
      this.storage.clear();
      for (const [table, rows] of snapshot.entries()) {
        this.storage.set(table, rows);
      }
      throw err;
    }
  }

  public async tx<T>(fn: (trx: FireDatabase) => Promise<T>): Promise<T> {
    return this.transaction(fn);
  }

  public clear(): void {
    this.storage.clear();
  }
}
