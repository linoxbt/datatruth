import { DurableObject } from 'cloudflare:workers';

export class AuditQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY, count INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO quota (id, count) VALUES (1, 0)');
  }

  consume() {
    const rows = this.ctx.storage.sql.exec('UPDATE quota SET count = count + 1 WHERE id = 1 AND count < 50 RETURNING count').toArray();
    return rows.length === 1;
  }
}
