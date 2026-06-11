/** REPORT : calendar-query (time-range), calendar-multiget, sync-collection (RFC 6578). */

import { formatSyncToken, parseSyncToken } from '../../core/etag.js';
import type { Calendar, CalendarObject } from '../../core/models.js';
import type { CalendarRepo, ObjectRepo } from '../../core/ports.js';
import { multistatus, type PropstatResponse } from '../xml/builder.js';
import { parseReport } from '../xml/parser.js';
import { objectHref, objectResolver, resolveProps } from './props.js';
import type { DavResponse } from './propfind.js';

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' };

export function handleReport(
  cal: Calendar,
  body: string,
  calendars: CalendarRepo,
  objects: ObjectRepo
): DavResponse {
  const report = parseReport(body);
  const props = 'props' in report && report.props.length ? report.props : ['getetag', 'calendar-data'];

  switch (report.type) {
    case 'calendar-query': {
      // Filtrage en mémoire : un calendrier personnel reste petit (<10k objets).
      // Si ça devient un goulot, basculer sur idx_obj_timerange côté SQL.
      const start = report.start ? icalUtcToIso(report.start) : null;
      const end = report.end ? icalUtcToIso(report.end) : null;
      const hits = objects.listAlive(cal.id).filter((o) => inRange(o, start, end));
      return ok(hits.map((o) => toResponse(cal, o, props)));
    }

    case 'calendar-multiget': {
      const responses = report.hrefs.map((href): PropstatResponse => {
        const name = decodeURIComponent(href.split('/').pop() ?? '');
        const obj = objects.findByHref(cal.id, name);
        return obj && !obj.deleted_at
          ? toResponse(cal, obj, props)
          : { href, found: {}, notFound: [], status: '404 Not Found' };
      });
      return ok(responses);
    }

    case 'sync-collection': {
      // Token vide ou étranger => 0 => sync initiale complète, comportement RFC.
      const since = report.sync_token ? (parseSyncToken(report.sync_token) ?? 0) : 0;
      const responses = objects.changedSince(cal.id, since).map((o): PropstatResponse =>
        o.deleted_at
          ? { href: objectHref(cal.uri, o.href), found: {}, notFound: [], status: '404 Not Found' }
          : toResponse(cal, o, props)
      );
      const current = calendars.findByUri(cal.uri) ?? cal; // token à jour après mutations
      return ok(responses, formatSyncToken(current.sync_token));
    }

    case 'unsupported':
      return { status: 403 };
  }
}

function toResponse(cal: Calendar, obj: CalendarObject, props: string[]): PropstatResponse {
  return resolveProps(objectHref(cal.uri, obj.href), props, objectResolver(obj));
}

function ok(responses: PropstatResponse[], syncToken?: string): DavResponse {
  return { status: 207, headers: XML_HEADERS, body: multistatus(responses, syncToken) };
}

/** '20260611T000000Z' -> '2026-06-11T00:00:00.000Z' (comparable aux colonnes ISO). */
function icalUtcToIso(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : v;
}

/** Chevauchement [dtstart, dtend) / [start, end). dtend NULL (récurrence
 *  sans fin) => toujours candidat côté borne basse. */
function inRange(o: CalendarObject, start: string | null, end: string | null): boolean {
  if (end && o.dtstart_utc && o.dtstart_utc >= end) return false;
  if (start && o.dtend_utc && o.dtend_utc <= start) return false;
  return true;
}
