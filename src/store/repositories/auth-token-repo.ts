import type Database from 'better-sqlite3';
import type { AuthToken } from '../../core/models.js';
import type { AuthTokenRepo } from '../../core/ports.js';

export function createAuthTokenRepo(db: Database.Database): AuthTokenRepo {
  return {
    findByLabel: (label) =>
      db.prepare('SELECT * FROM auth_tokens WHERE label = ?').get(label) as AuthToken | undefined,

    touch: (id, now_iso) => {
      db.prepare('UPDATE auth_tokens SET last_used_at = ? WHERE id = ?').run(now_iso, id);
    },
  };
}
