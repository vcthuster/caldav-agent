/**
 * Abonne l'agent à un flux .ics externe :
 * npm run subscribe -- <url> <uri-locale> "<Nom affiché>" [intervalle_s]
 * Crée le calendrier read-only associé ; la première sync a lieu au prochain tick.
 */

import { openDb, nowIso } from '../src/store/db.js';

const [url, uri, name, interval] = process.argv.slice(2);
if (!url || !uri || !name) {
  console.error('Usage: npm run subscribe -- <url> <uri-locale> "<Nom affiché>" [intervalle_s=3600]');
  process.exit(1);
}

const db = openDb(process.env['AGENT_DB'] ?? 'data/agent.db');
const now = nowIso();
db.transaction(() => {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO calendars (uri, display_name, is_subscription, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`
    )
    .run(uri, name, now, now);
  db.prepare(
    `INSERT INTO subscriptions (calendar_id, url, sync_interval_s) VALUES (?, ?, ?)`
  ).run(lastInsertRowid, url, Number(interval ?? 3600));
})();

console.log(`Abonnement créé : ${name} (/calendars/${uri}/) <- ${url}`);
