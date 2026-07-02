/**
 * Façade JSON REST — accès programmatique au même domaine que CalDAV.
 * Toute écriture passe par ObjectService : ctag, tombstones et événements
 * du bus restent corrects, les clients CalDAV voient les changements.
 *
 *   GET    /api/calendars
 *   GET    /api/events?calendar=<uri>&start=<ISO>&end=<ISO>
 *   POST   /api/events            {calendar, summary, start, end, description?, location?}
 *   PUT    /api/events/<calendar>/<href>  {summary?, start?, end?, description?, location?, etag?}  (modif partielle)
 *   DELETE /api/events/<calendar>/<href>
 */

import { randomUUID } from 'node:crypto';
import { buildEvent, patchEvent, type EventPatch } from '../core/ical.js';
import type { CalendarObject } from '../core/models.js';
import type { CalendarRepo, ObjectRepo } from '../core/ports.js';
import { PreconditionFailed, ReadOnlyCalendar, type ObjectService } from '../core/services/object-service.js';
import type { DavResponse } from './handlers/propfind.js';
import { runSingleSync } from '../sync/scheduler.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export async function handleApi(
  method: string,
  path: string,
  query: URLSearchParams,
  body: string,
  calendars: CalendarRepo,
  objects: ObjectRepo,
  subscriptions: import('../core/ports.js').SubscriptionRepo,
  service: ObjectService,
  tx: <T>(fn: () => T) => T,
  bus: import('../core/events.js').EventBus
): Promise<DavResponse> {
  if (method === 'GET' && path === '/api/calendars') {
    return json(200, calendars.list().map((c) => ({
      uri: c.uri,
      name: c.display_name,
      color: c.color,
      read_only: c.is_subscription === 1,
    })));
  }

  if (method === 'GET' && path === '/api/events') {
    const calUri = query.get('calendar');
    const start = query.get('start');
    const end = query.get('end');
    const cals = calUri ? calendars.list().filter((c) => c.uri === calUri) : calendars.list();
    if (calUri && cals.length === 0) return err(404, 'calendrier inconnu');

    const events = cals.flatMap((cal) =>
      objects
        .listAlive(cal.id)
        .filter((o) => inRange(o, start, end))
        .map((o) => ({
          calendar: cal.uri,
          href: o.href,
          uid: o.uid,
          summary: o.summary,
          start: o.dtstart_utc,
          end: o.dtend_utc,
          recurring: o.is_recurring === 1,
          etag: o.etag,
        }))
    );
    events.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    return json(200, events);
  }

  if (method === 'POST' && path === '/api/events') {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return err(400, 'corps JSON invalide');
    }
    const { calendar, summary, start, end, description, location } = input as Record<string, string | undefined>;
    if (!summary || !isIsoDate(start) || !isIsoDate(end))
      return err(400, 'champs requis : summary, start (ISO 8601), end (ISO 8601)');
    if (new Date(end) <= new Date(start)) return err(400, 'end doit être après start');

    const cal = calendars.findByUri(calendar ?? 'personnel');
    if (!cal) return err(404, 'calendrier inconnu');

    const uid = `${randomUUID()}@caldav-agent`;
    const href = `${uid}.ics`;
    const ical = buildEvent({
      uid, summary, start, end,
      ...(description ? { description } : {}),
      ...(location ? { location } : {}),
    });
    try {
      const etag = service.put(cal, href, ical, { if_none_match_any: true });
      return json(201, { calendar: cal.uri, href, uid, etag });
    } catch (e) {
      if (e instanceof ReadOnlyCalendar) return err(403, 'calendrier en lecture seule (abonnement)');
      throw e;
    }
  }

  if (method === 'POST' && path === '/api/subscriptions') {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return err(400, 'corps JSON invalide');
    }
    const { uri, name, url, color } = input as Record<string, string | undefined>;
    if (!uri || !name || !url) {
      return err(400, 'champs requis : uri, name, url');
    }
    if (calendars.findByUri(uri)) {
      return err(409, 'un calendrier avec cette uri existe déjà');
    }

    try {
      const calId = tx(() => {
        const id = calendars.insert({
          uri,
          display_name: name,
          color: color ?? null,
          timezone: 'Europe/Paris', // par défaut
          is_subscription: 1,
        });
        subscriptions.insert({
          calendar_id: id,
          url,
          sync_interval_s: 3600, // 1 heure
        });
        return id;
      });
      return json(201, { calendar_id: calId, uri, message: 'Abonnement ajouté' });
    } catch (e) {
      return err(500, "erreur lors de la création de l'abonnement");
    }
  }

  const subActionMatch = /^\/api\/subscriptions\/([^/]+)(?:\/(sync))?$/.exec(path);
  if (subActionMatch?.[1]) {
    const uri = subActionMatch[1];
    const action = subActionMatch[2]; // 'sync' or undefined

    const cal = calendars.findByUri(uri);
    if (!cal) return err(404, 'calendrier inconnu');
    if (cal.is_subscription !== 1) return err(400, "ce calendrier n'est pas un abonnement");

    if (method === 'DELETE' && !action) {
      calendars.delete(cal.id);
      return { status: 204 };
    }

    if (method === 'POST' && action === 'sync') {
      const sub = subscriptions.findByCalendarId(cal.id);
      if (!sub) return err(404, "abonnement introuvable en base");
      await runSingleSync(sub, { calendars, objects, subscriptions, objectService: service, bus });
      return json(200, { message: 'Synchronisation forcée effectuée' });
    }
  }

  const evMatch = /^\/api\/events\/([^/]+)\/([^/]+)$/.exec(path);
  // URL.pathname ne décode PAS le %XX : un href créé via l'API (`<uid>@caldav-agent.ics`)
  // arrive donc en `%40` et ne matcherait aucun objet stocké. On décode les deux segments.
  const evCal = evMatch?.[1] ? decodeURIComponent(evMatch[1]) : undefined;
  const evHref = evMatch?.[2] ? decodeURIComponent(evMatch[2]) : undefined;

  if (method === 'PUT' && evCal && evHref) {
    const cal = calendars.findByUri(evCal);
    if (!cal) return err(404, 'calendrier inconnu');
    const existing = objects.findByHref(cal.id, evHref);
    if (!existing || existing.deleted_at) return err(404, 'événement inconnu');

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return err(400, 'corps JSON invalide');
    }
    const { summary, start, end, description, location, etag } = input as Record<string, string | undefined>;
    // Modification partielle : au moins un champ à changer.
    const patch: EventPatch = {
      ...(summary !== undefined ? { summary } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(location !== undefined ? { location } : {}),
    };
    if (Object.keys(patch).length === 0)
      return err(400, 'aucun champ à modifier (summary, start, end, description ou location)');
    if (start !== undefined && !isIsoDate(start)) return err(400, 'start invalide (ISO 8601)');
    if (end !== undefined && !isIsoDate(end)) return err(400, 'end invalide (ISO 8601)');
    // Ordre start<end vérifié sur les valeurs EFFECTIVES (après patch), quand les
    // deux sont connues (dtend_utc est null pour un récurrent → on ne bloque pas).
    const effStart = start ?? existing.dtstart_utc;
    const effEnd = end ?? existing.dtend_utc;
    if (effStart && effEnd && new Date(effEnd) <= new Date(effStart))
      return err(400, 'end doit être après start');

    let updated: string;
    try {
      updated = patchEvent(existing.ical, patch);
    } catch {
      return err(422, 'événement existant illisible');
    }
    try {
      const newEtag = service.put(cal, evHref, updated, {
        ...(etag !== undefined ? { if_match: etag } : {}),
      });
      return json(200, { calendar: cal.uri, href: evHref, uid: existing.uid, etag: newEtag });
    } catch (e) {
      if (e instanceof PreconditionFailed) return err(412, 'événement modifié entre-temps (etag périmé)');
      if (e instanceof ReadOnlyCalendar) return err(403, 'calendrier en lecture seule (abonnement)');
      throw e;
    }
  }

  if (method === 'DELETE' && evCal && evHref) {
    const cal = calendars.findByUri(evCal);
    if (!cal) return err(404, 'calendrier inconnu');
    try {
      return service.delete(cal, evHref) ? { status: 204 } : err(404, 'événement inconnu');
    } catch (e) {
      if (e instanceof ReadOnlyCalendar) return err(403, 'calendrier en lecture seule (abonnement)');
      throw e;
    }
  }

  return err(404, 'route inconnue');
}

function json(status: number, payload: unknown): DavResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function err(status: number, message: string): DavResponse {
  return json(status, { error: message });
}

function isIsoDate(v: string | undefined): v is string {
  return !!v && !Number.isNaN(Date.parse(v));
}

/** Même sémantique de chevauchement que le calendar-query CalDAV. */
function inRange(o: CalendarObject, start: string | null, end: string | null): boolean {
  if (end && o.dtstart_utc && o.dtstart_utc >= new Date(end).toISOString()) return false;
  if (start && o.dtend_utc && o.dtend_utc <= new Date(start).toISOString()) return false;
  return true;
}
