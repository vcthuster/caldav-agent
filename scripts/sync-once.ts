/** Force une passe de synchronisation immédiate des abonnements échus, puis sort.
 *  Utile en debug et pour vérifier un nouvel abonnement sans attendre le tick. */

import { EventBus } from '../src/core/events.js';
import { ObjectService } from '../src/core/services/object-service.js';
import { openDb } from '../src/store/db.js';
import { createCalendarRepo } from '../src/store/repositories/calendar-repo.js';
import { createObjectRepo } from '../src/store/repositories/object-repo.js';
import { createSubscriptionRepo } from '../src/store/repositories/subscription-repo.js';
import { runDueSyncs } from '../src/sync/scheduler.js';

const db = openDb(process.env['AGENT_DB'] ?? 'data/agent.db');
const calendars = createCalendarRepo(db);
const objects = createObjectRepo(db);
const subscriptions = createSubscriptionRepo(db);
const bus = new EventBus();
bus.on('sync.completed', (p) => console.log('sync.completed:', JSON.stringify(p)));
const objectService = new ObjectService(calendars, objects, (fn) => db.transaction(fn)(), bus);

await runDueSyncs({ calendars, objects, subscriptions, objectService, bus });
for (const s of db.prepare('SELECT url, last_status, last_sync_at FROM subscriptions').all() as
  { url: string; last_status: string; last_sync_at: string }[]) {
  console.log(`${s.url} -> ${s.last_status} (${s.last_sync_at})`);
}
