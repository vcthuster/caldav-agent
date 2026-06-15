import type Database from 'better-sqlite3';
import type { Subscription } from '../../core/models.js';
import type { SubscriptionRepo } from '../../core/ports.js';

export function createSubscriptionRepo(db: Database.Database): SubscriptionRepo {
  return {
    findByCalendarId: (calendar_id) =>
      db.prepare('SELECT * FROM subscriptions WHERE calendar_id = ?').get(calendar_id) as Subscription | undefined,

    // Échu = jamais synchronisé, ou dernière sync plus vieille que l'intervalle.
    // Calcul fait en SQL sur les ISO strings (comparables lexicographiquement en UTC).
    listDue: (now_iso) =>
      db
        .prepare(
          `SELECT * FROM subscriptions
           WHERE last_sync_at IS NULL
              OR datetime(last_sync_at, '+' || sync_interval_s || ' seconds') <= datetime(?)`
        )
        .all(now_iso) as Subscription[],

    update: (sub) => {
      db.prepare(
        `UPDATE subscriptions SET
           http_etag = @http_etag, http_last_modified = @http_last_modified,
           content_hash = @content_hash, last_sync_at = @last_sync_at, last_status = @last_status
         WHERE id = @id`
      ).run(sub);
    },

    insert: (sub) => {
      db.prepare(
        `INSERT INTO subscriptions (calendar_id, url, sync_interval_s)
         VALUES (@calendar_id, @url, @sync_interval_s)`
      ).run(sub);
    },
  };
}
