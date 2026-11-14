import { FireDatabase, FireDatabaseOptions, QueryBuilder, TableModel } from '../types';
import { MemoryDatabase } from './memory-adapter';
import { SQLiteDatabase } from './sqlite-adapter';
import { generateMock } from '../schema/mock';

function toSingular(name: string): string {
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  if (name.endsWith('es') && !name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

function toPlural(name: string): string {
  if (name.endsWith('y') && !/[aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  if (name.endsWith('s')) return name;
  return name + 's';
}

async function attachRelations(
  db: FireDatabase,
  parentTableName: string,
  rows: Record<string, any>[],
  relations: string[]
): Promise<void> {
  if (!rows || rows.length === 0 || !relations || relations.length === 0) return;

  const parentSingular = toSingular(parentTableName);
  const possibleParentFkNames = [
    `${parentSingular}Id`,
    `${parentSingular}_id`,
    `${parentTableName}Id`,
    `${parentTableName}_id`,
  ];

  for (const rel of relations) {
    const isPluralRelation = rel.endsWith('s') || rel.endsWith('ies');
    const relSingular = toSingular(rel);
    const relPlural = toPlural(rel);
    const candidateTableNames = [rel, relPlural, relSingular];

    for (const row of rows) {
      if (!row) continue;
      let resolved = false;

      // 1. Belongs-To / Many-to-One
      const possibleFkInParent = [
        `${relSingular}Id`,
        `${relSingular}_id`,
        `${rel}Id`,
        `${rel}_id`,
      ];

      for (const fk of possibleFkInParent) {
        if (row[fk] !== undefined && row[fk] !== null) {
          for (const tbl of candidateTableNames) {
            try {
              const relatedItem = await db.table(tbl).findById(row[fk]);
              if (relatedItem) {
                row[rel] = relatedItem;
                resolved = true;
                break;
              }
            } catch {}
          }
          if (resolved) break;
        }
      }

      if (resolved) continue;

      // 2. Has-Many / One-to-Many
      for (const tbl of candidateTableNames) {
        let matchingChildren: any[] = [];
        for (const parentFk of possibleParentFkNames) {
          try {
            const results = await db.table(tbl).where(parentFk, row.id).find();
            if (results && results.length > 0) {
              matchingChildren = results;
              break;
            }
          } catch {}
        }

        if (matchingChildren.length > 0 || isPluralRelation) {
          row[rel] = isPluralRelation ? matchingChildren : (matchingChildren[0] || null);
          resolved = true;
          break;
        }
      }

      if (!resolved && isPluralRelation) {
        row[rel] = [];
      }
    }
  }
}

function createTableModel(
  target: FireDatabase,
  tableName: string,
  includedRelations: string[] = [],
  baseQb?: QueryBuilder,
  tenantId?: string
): TableModel {
  const getQb = () => {
    let qb = baseQb || target.table(tableName);
    if (tenantId && !baseQb) {
      qb = qb.where('tenantId', tenantId);
    }
    return qb;
  };

  const model: TableModel = {
    include: (relation: string | string[]) => {
      const rels = Array.isArray(relation) ? relation : [relation];
      return createTableModel(target, tableName, [...includedRelations, ...rels], baseQb, tenantId);
    },
    where: (field: string, opOrVal: any, val?: any) => {
      const newQb = getQb().where(field, opOrVal, val);
      return createTableModel(target, tableName, includedRelations, newQb, tenantId);
    },
    limit: (count: number) => {
      const newQb = getQb().limit(count);
      return createTableModel(target, tableName, includedRelations, newQb, tenantId);
    },
    offset: (count: number) => {
      const newQb = getQb().offset(count);
      return createTableModel(target, tableName, includedRelations, newQb, tenantId);
    },
    orderBy: (field: string, direction?: 'asc' | 'desc') => {
      const newQb = getQb().orderBy(field, direction);
      return createTableModel(target, tableName, includedRelations, newQb, tenantId);
    },
    find: async (filter?: Record<string, any>) => {
      let qb = getQb();
      if (filter) {
        for (const [k, v] of Object.entries(filter)) {
          qb = qb.where(k, v);
        }
      }
      const rows = await qb.find();
      if (includedRelations.length > 0) {
        await attachRelations(target, tableName, rows, includedRelations);
      }
      return rows;
    },
    findOne: async (filter?: Record<string, any>) => {
      let qb = getQb();
      if (filter) {
        for (const [k, v] of Object.entries(filter)) {
          qb = qb.where(k, v);
        }
      }
      const row = await qb.findOne();
      if (row && includedRelations.length > 0) {
        await attachRelations(target, tableName, [row], includedRelations);
      }
      return row;
    },
    findById: async (id: string | number) => {
      const row = await getQb().findById(id);
      if (row && includedRelations.length > 0) {
        await attachRelations(target, tableName, [row], includedRelations);
      }
      return row;
    },
    insert: (data: any) => {
      if (tenantId) {
        if (Array.isArray(data)) {
          data = data.map((d) => ({ tenantId, ...d }));
        } else if (typeof data === 'object' && data !== null) {
          data = { tenantId, ...data };
        }
      }
      return getQb().insert(data);
    },
    update: (idOrFilter: any, data?: any) => {
      if (data === undefined) {
        return getQb().update(idOrFilter);
      }
      return getQb().where('id', idOrFilter).update(data);
    },
    delete: (idOrFilter?: any) => {
      if (idOrFilter === undefined) {
        return getQb().delete();
      }
      if (typeof idOrFilter === 'string' || typeof idOrFilter === 'number') {
        return getQb().where('id', idOrFilter).delete();
      }
      let qb = getQb();
      for (const [k, v] of Object.entries(idOrFilter)) {
        qb = qb.where(k, v);
      }
      return qb.delete();
    },
  };

  return model;
}

export function createProxyDatabase(db: FireDatabase, options?: { tenantId?: string }): FireDatabase {
  return new Proxy(db, {
    get(target, prop: string) {
      if (prop === 'seed') {
        return async (tbl: string, schema: any, count = 10) => {
          const items = Array.from({ length: count }, () => {
            const mock = generateMock(schema);
            if (options?.tenantId) {
              mock.tenantId = options.tenantId;
            }
            return mock;
          });
          return target.table(tbl).insert(items);
        };
      }

      if (prop === 'transaction' || prop === 'tx') {
        return (fn: (trx: FireDatabase) => Promise<any>) => {
          const rawTrxFn = (target.tx || target.transaction).bind(target);
          return rawTrxFn((rawTrx: FireDatabase) => {
            return fn(createProxyDatabase(rawTrx, options));
          });
        };
      }

      if (prop in target || typeof prop === 'symbol') {
        const val = (target as any)[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }

      // Dynamic table model access: ctx.db.products -> TableModel
      return createTableModel(target, prop, [], undefined, options?.tenantId);
    },
  });
}

export function createDatabaseHub(options: FireDatabaseOptions = {}): FireDatabase {
  const driver = options.driver || 'memory';
  let rawDb: FireDatabase;

  switch (driver) {
    case 'sqlite':
      rawDb = new SQLiteDatabase(options.url || ':memory:');
      break;
    case 'postgres':
    case 'mysql':
      rawDb = new MemoryDatabase();
      break;
    case 'memory':
    default:
      rawDb = new MemoryDatabase();
      break;
  }

  return createProxyDatabase(rawDb);
}
