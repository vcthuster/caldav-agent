import type Database from 'better-sqlite3';
import type { CalendarObject } from '../../core/models.js';
import type { ObjectRepo } from '../../core/ports.js';

export function createObjectRepo(db: Database.Database): ObjectRepo {
  return {
    findByHref: (calendar_id, href) =>
      db
        .prepare('SELECT * FROM calendar_objects WHERE calendar_id = ? AND href = ?')
        .get(calendar_id, href) as CalendarObject | undefined,

    listAlive: (calendar_id) =>
      db
        .prepare('SELECT * FROM calendar_objects WHERE calendar_id = ? AND deleted_at IS NULL')
        .all(calendar_id) as CalendarObject[],

    etagIndex: (calendar_id) => {
      const rows = db
        .prepare(
          'SELECT uid, etag FROM calendar_objects WHERE calendar_id = ? AND deleted_at IS NULL'
        )
        .all(calendar_id) as { uid: string; etag: string }[];
      return new Map(rows.map((r) => [r.uid, r.etag]));
    },

    changedSince: (calendar_id, sync_token) =>
      db
        .prepare('SELECT * FROM calendar_objects WHERE calendar_id = ? AND sync_token > ?')
        .all(calendar_id, sync_token) as CalendarObject[],

    upsert: (obj) => {
      db.prepare(
        `INSERT INTO calendar_objects
           (calendar_id, uid, href, etag, ical, summary, dtstart_utc, dtend_utc,
            is_recurring, deleted_at, sync_token, updated_at)
         VALUES
           (@calendar_id, @uid, @href, @etag, @ical, @summary, @dtstart_utc, @dtend_utc,
            @is_recurring, NULL, @sync_token, @updated_at)
         ON CONFLICT (calendar_id, href) DO UPDATE SET
           uid = @uid, etag = @etag, ical = @ical, summary = @summary,
           dtstart_utc = @dtstart_utc, dtend_utc = @dtend_utc, is_recurring = @is_recurring,
           deleted_at = NULL, sync_token = @sync_token, updated_at = @updated_at`
      ).run({ ...obj, deleted_at: undefined });
    },

    tombstone: (calendar_id, href, sync_token) => {
      db.prepare(
        `UPDATE calendar_objects
         SET deleted_at = @now, sync_token = @sync_token, updated_at = @now
         WHERE calendar_id = @calendar_id AND href = @href AND deleted_at IS NULL`
      ).run({ calendar_id, href, sync_token, now: new Date().toISOString() });
    },
  };
}
