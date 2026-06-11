/**
 * Façade JSON REST — accès programmatique au même domaine que CalDAV.
 * Toute écriture passe par ObjectService : ctag, tombstones et événements
 * du bus restent corrects, les clients CalDAV voient les changements.
 *
 *   GET    /api/calendars
 *   GET    /api/events?calendar=<uri>&start=<ISO>&end=<ISO>
 *   POST   /api/events            {calendar, summary, start, end, description?, location?}
 *   DELETE /api/events/<calendar>/<href>
 */

import { randomUUID } from 'node:crypto';
import { buildEvent } from '../core/ical.js';
import type { CalendarObject } from '../core/models.js';
import type { CalendarRepo, ObjectRepo } from '../core/ports.js';
import { ReadOnlyCalendar, type ObjectService } from '../core/services/object-service.js';
import type { DavResponse } from './handlers/propfind.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export function handleApi(
  method: string,
  path: string,
  query: URLSearchParams,
  body: string,
  calendars: CalendarRepo,
  objects: ObjectRepo,
  service: ObjectService
): DavResponse {
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

  const del = /^\/api\/events\/([^/]+)\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && del?.[1] && del[2]) {
    const cal = calendars.findByUri(del[1]);
    if (!cal) return err(404, 'calendrier inconnu');
    try {
      return service.delete(cal, del[2]) ? { status: 204 } : err(404, 'événement inconnu');
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
