import type Database from 'better-sqlite3';
import type { Calendar } from '../../core/models.js';
import type { CalendarRepo } from '../../core/ports.js';
import { nowIso } from '../db.js';

export function createCalendarRepo(db: Database.Database): CalendarRepo {
  return {
    findByUri: (uri) =>
      db.prepare('SELECT * FROM calendars WHERE uri = ?').get(uri) as Calendar | undefined,

    list: () => db.prepare('SELECT * FROM calendars ORDER BY id').all() as Calendar[],

    bumpSyncToken: (calendar_id) =>
      (
        db
          .prepare(
            'UPDATE calendars SET sync_token = sync_token + 1, updated_at = ? WHERE id = ? RETURNING sync_token'
          )
          .get(nowIso(), calendar_id) as { sync_token: number }
      ).sync_token,

    insert: (cal) => {
      const now = nowIso();
      const res = db.prepare(
        `INSERT INTO calendars (uri, display_name, color, timezone, is_subscription, sync_token, created_at, updated_at)
         VALUES (@uri, @display_name, @color, @timezone, @is_subscription, 1, @created_at, @updated_at)`
      ).run({ ...cal, created_at: now, updated_at: now });
      return res.lastInsertRowid as number;
    },

    delete: (id) => {
      db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
    },
  };
}
