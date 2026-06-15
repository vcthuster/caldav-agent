/** Composition root : instanciation manuelle et démarrage du serveur. */

import { EventBus } from './core/events.js';
import { ObjectService } from './core/services/object-service.js';
import { createCaldavServer } from './protocol/server.js';
import { startScheduler } from './sync/scheduler.js';
import { openDb, nowIso } from './store/db.js';
import { createAuthTokenRepo } from './store/repositories/auth-token-repo.js';
import { createCalendarRepo } from './store/repositories/calendar-repo.js';
import { createObjectRepo } from './store/repositories/object-repo.js';
import { createSubscriptionRepo } from './store/repositories/subscription-repo.js';

const DB_PATH = process.env['AGENT_DB'] ?? 'data/agent.db';
const PORT = Number(process.env['AGENT_PORT'] ?? 5232);

const db = openDb(DB_PATH);
const calendars = createCalendarRepo(db);
const objects = createObjectRepo(db);
const subscriptions = createSubscriptionRepo(db);
const authTokens = createAuthTokenRepo(db);

// Calendrier personnel par défaut au premier démarrage.
if (calendars.list().length === 0) {
  db.prepare(
    `INSERT INTO calendars (uri, display_name, color, created_at, updated_at)
     VALUES ('personnel', 'Personnel', '#3478F6FF', ?, ?)`
  ).run(nowIso(), nowIso());
}

const bus = new EventBus();
const tx = <T>(fn: () => T): T => db.transaction(fn)();
const objectService = new ObjectService(calendars, objects, tx, bus);

startScheduler({ calendars, objects, subscriptions, objectService, bus });

const server = createCaldavServer({ calendars, objects, subscriptions, objectService, authTokens, tx, bus });
server.listen(PORT, () => {
  console.log(`[caldav-agent] serveur CalDAV sur http://0.0.0.0:${PORT} (bdd: ${DB_PATH})`);
});
