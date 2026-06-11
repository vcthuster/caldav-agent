/**
 * Boucle de synchronisation : un seul timer, traitement séquentiel (RAM bornée
 * à un flux en mémoire à la fois). En cas d'erreur, last_sync_at est quand même
 * posé : l'intervalle de l'abonnement sert de backoff naturel.
 */

import type { EventBus } from '../core/events.js';
import type { CalendarRepo, ObjectRepo, SubscriptionRepo } from '../core/ports.js';
import type { ObjectService } from '../core/services/object-service.js';
import { fetchFeed } from './fetcher.js';
import { reconcile } from './reconciler.js';

export interface SyncDeps {
  calendars: CalendarRepo;
  objects: ObjectRepo;
  subscriptions: SubscriptionRepo;
  objectService: ObjectService;
  bus: EventBus;
}

/** Synchronise tous les abonnements échus. Exporté seul pour testabilité. */
export async function runDueSyncs(deps: SyncDeps): Promise<void> {
  for (const sub of deps.subscriptions.listDue(new Date().toISOString())) {
    const cal = deps.calendars.list().find((c) => c.id === sub.calendar_id);
    if (!cal) continue;

    const result = await fetchFeed(sub);
    const now = new Date().toISOString();
    switch (result.kind) {
      case 'unchanged':
        deps.subscriptions.update({ ...sub, last_sync_at: now, last_status: 'unchanged' });
        break;
      case 'error':
        deps.subscriptions.update({ ...sub, last_sync_at: now, last_status: `error: ${result.message}` });
        console.error(`[sync] ${sub.url} : ${result.message}`);
        break;
      case 'changed': {
        try {
          const { changed, removed } = reconcile(cal, result.body, deps.objects, deps.objectService, deps.bus);
          deps.subscriptions.update({
            ...sub,
            http_etag: result.http_etag,
            http_last_modified: result.http_last_modified,
            content_hash: result.content_hash,
            last_sync_at: now,
            last_status: `ok (+${changed} / -${removed})`,
          });
        } catch (e) {
          // Flux téléchargé mais inexploitable : on garde l'état précédent.
          deps.subscriptions.update({ ...sub, last_sync_at: now, last_status: `error: parse: ${String(e)}` });
          console.error(`[sync] ${sub.url} : parsing impossible`, e);
        }
        break;
      }
    }
  }
}

const TICK_MS = 60_000;

export function startScheduler(deps: SyncDeps): NodeJS.Timeout {
  void runDueSyncs(deps); // premier passage immédiat au démarrage
  return setInterval(() => void runDueSyncs(deps), TICK_MS);
}
