import { FireDatabase } from '../types';

export interface Migration {
  name: string;
  up: (db: FireDatabase) => Promise<void>;
  down?: (db: FireDatabase) => Promise<void>;
}

export class FireMigrator {
  constructor(private db: FireDatabase) {}

  private async ensureMigrationTable(): Promise<void> {
    try {
      await this.db.raw(
        `CREATE TABLE IF NOT EXISTS _fire_migrations (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE,
          batch INTEGER,
          appliedAt TEXT
        )`
      );
    } catch {}
  }

  public async up(migrations: Migration[]): Promise<{ applied: string[]; batch: number }> {
    await this.ensureMigrationTable();

    let appliedRows: any[] = [];
    try {
      appliedRows = await this.db.table('_fire_migrations').find();
    } catch {}

    const appliedNames = new Set(appliedRows.map((r) => r.name));
    const latestBatch = appliedRows.reduce((max, r) => Math.max(max, r.batch || 0), 0);
    const newBatch = latestBatch + 1;
    const applied: string[] = [];

    for (const mig of migrations) {
      if (!appliedNames.has(mig.name)) {
        await mig.up(this.db);
        await this.db.table('_fire_migrations').insert({
          id: `mig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: mig.name,
          batch: newBatch,
          appliedAt: new Date().toISOString(),
        });
        applied.push(mig.name);
      }
    }

    return { applied, batch: newBatch };
  }

  public async down(migrations: Migration[]): Promise<{ rolledBack: string[] }> {
    await this.ensureMigrationTable();

    let appliedRows: any[] = [];
    try {
      appliedRows = await this.db.table('_fire_migrations').find();
    } catch {}

    if (appliedRows.length === 0) return { rolledBack: [] };

    const latestBatch = appliedRows.reduce((max, r) => Math.max(max, r.batch || 0), 0);
    const targetRows = appliedRows.filter((r) => r.batch === latestBatch);
    const rolledBack: string[] = [];

    const migMap = new Map(migrations.map((m) => [m.name, m]));

    for (const row of targetRows.reverse()) {
      const mig = migMap.get(row.name);
      if (mig && mig.down) {
        await mig.down(this.db);
      }
      await this.db.table('_fire_migrations').where('name', row.name).delete();
      rolledBack.push(row.name);
    }

    return { rolledBack };
  }

  public async status(migrations: Migration[]): Promise<Array<{ name: string; status: 'applied' | 'pending'; appliedAt?: string }>> {
    await this.ensureMigrationTable();
    let appliedRows: any[] = [];
    try {
      appliedRows = await this.db.table('_fire_migrations').find();
    } catch {}

    const appliedMap = new Map(appliedRows.map((r) => [r.name, r]));

    return migrations.map((m) => {
      const row = appliedMap.get(m.name);
      return {
        name: m.name,
        status: row ? 'applied' : 'pending',
        appliedAt: row ? row.appliedAt : undefined,
      };
    });
  }
}
