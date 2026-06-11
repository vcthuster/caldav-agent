/**
 * Réconciliation d'un flux parsé avec la BDD : diff par etag, sans doublons
 * par construction (clé = UID). Les écritures passent par ObjectService,
 * qui gère transaction, sync_token et événements.
 */

import { computeEtag } from '../core/etag.js';
import { splitFeedByUid } from '../core/ical.js';
import type { EventBus } from '../core/events.js';
import type { Calendar } from '../core/models.js';
import type { ObjectRepo } from '../core/ports.js';
import type { ObjectService } from '../core/services/object-service.js';

export interface ReconcileResult {
  changed: number;
  removed: number;
}

export function reconcile(
  cal: Calendar,
  feed: string,
  objects: ObjectRepo,
  service: ObjectService,
  bus: EventBus
): ReconcileResult {
  const incoming = splitFeedByUid(feed); // uid -> VCALENDAR autonome
  const existing = objects.listAlive(cal.id); // index uid -> {href, etag}
  const byUid = new Map(existing.map((o) => [o.uid, o]));

  let changed = 0;
  for (const [uid, ical] of incoming) {
    const current = byUid.get(uid);
    if (current && current.etag === computeEtag(ical)) continue; // inchangé
    service.put(cal, current?.href ?? hrefForUid(uid), ical, { from_sync: true });
    changed++;
  }

  let removed = 0;
  for (const obj of existing) {
    if (incoming.has(obj.uid)) continue;
    service.delete(cal, obj.href, { from_sync: true });
    removed++;
  }

  bus.emit('sync.completed', { calendar_id: cal.id, changed, removed });
  return { changed, removed };
}

/** Nom de ressource dérivé de l'UID, restreint aux caractères sûrs en URL. */
function hrefForUid(uid: string): string {
  return `${uid.replace(/[^A-Za-z0-9@._-]/g, '_')}.ics`;
}
