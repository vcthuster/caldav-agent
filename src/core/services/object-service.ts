/**
 * Écritures d'objets calendrier : règles de préconditions HTTP (etag),
 * read-only des abonnements, bump du sync_token, émission des événements.
 * Toute mutation passe ici — le protocole et la sync n'écrivent jamais en direct.
 */

import { computeEtag } from '../etag.js';
import { extractMeta } from '../ical.js';
import type { EventBus } from '../events.js';
import type { Calendar } from '../models.js';
import type { CalendarRepo, ObjectRepo, RunInTransaction } from '../ports.js';

export class PreconditionFailed extends Error {}
export class ReadOnlyCalendar extends Error {}

export interface PutOptions {
  /** Valeur de If-Match (etag attendu), sans guillemets. */
  if_match?: string;
  /** If-None-Match: * — création stricte, échoue si la ressource existe. */
  if_none_match_any?: boolean;
  /** true pour le worker de sync, qui a le droit d'écrire dans les abonnements. */
  from_sync?: boolean;
}

export class ObjectService {
  constructor(
    private calendars: CalendarRepo,
    private objects: ObjectRepo,
    private tx: RunInTransaction,
    private bus: EventBus
  ) {}

  /** Crée ou remplace un objet. Retourne le nouvel etag. */
  put(calendar: Calendar, href: string, ical: string, opts: PutOptions = {}): string {
    if (calendar.is_subscription && !opts.from_sync) throw new ReadOnlyCalendar();
    const meta = extractMeta(ical);
    const etag = computeEtag(ical);

    return this.tx(() => {
      const existing = this.objects.findByHref(calendar.id, href);
      const alive = existing && !existing.deleted_at;
      if (opts.if_none_match_any && alive) throw new PreconditionFailed();
      if (opts.if_match !== undefined && (!alive || existing.etag !== opts.if_match))
        throw new PreconditionFailed();
      if (alive && existing.etag === etag) return etag; // no-op : ne bump pas le ctag

      const sync_token = this.calendars.bumpSyncToken(calendar.id);
      this.objects.upsert({
        calendar_id: calendar.id,
        uid: meta.uid,
        href,
        etag,
        ical,
        summary: meta.summary,
        dtstart_utc: meta.dtstart_utc,
        dtend_utc: meta.dtend_utc,
        is_recurring: meta.is_recurring,
        deleted_at: null,
        sync_token,
        updated_at: new Date().toISOString(),
      });
      this.bus.emit(alive ? 'object.updated' : 'object.created', {
        calendar_id: calendar.id,
        uid: meta.uid,
      });
      return etag;
    });
  }

  /** Supprime (tombstone). Retourne false si la ressource n'existe pas. */
  delete(calendar: Calendar, href: string, opts: PutOptions = {}): boolean {
    if (calendar.is_subscription && !opts.from_sync) throw new ReadOnlyCalendar();
    return this.tx(() => {
      const existing = this.objects.findByHref(calendar.id, href);
      if (!existing || existing.deleted_at) return false;
      if (opts.if_match !== undefined && existing.etag !== opts.if_match)
        throw new PreconditionFailed();
      const sync_token = this.calendars.bumpSyncToken(calendar.id);
      this.objects.tombstone(calendar.id, href, sync_token);
      this.bus.emit('object.deleted', { calendar_id: calendar.id, uid: existing.uid });
      return true;
    });
  }
}
