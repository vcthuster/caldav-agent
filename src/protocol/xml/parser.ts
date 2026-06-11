/**
 * Parsing des corps XML WebDAV/CalDAV.
 * removeNSPrefix : on matche sur les noms locaux ('displayname', 'calendar-data'…),
 * les clients utilisant des préfixes arbitraires — pas de collision en pratique
 * entre les vocabulaires DAV: et CALDAV: utilisés ici.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export interface PropfindRequest {
  /** Noms locaux des propriétés demandées ; vide = allprop. */
  props: string[];
}

export type ReportRequest =
  | { type: 'calendar-query'; start: string | null; end: string | null; props: string[] }
  | { type: 'calendar-multiget'; hrefs: string[]; props: string[] }
  | { type: 'sync-collection'; sync_token: string; props: string[] }
  | { type: 'unsupported' };

export function parsePropfind(body: string): PropfindRequest {
  if (!body.trim()) return { props: [] }; // corps vide = allprop (RFC 4918)
  const doc = parser.parse(body);
  return { props: localNames(doc.propfind?.prop) };
}

export function parseReport(body: string): ReportRequest {
  const doc = parser.parse(body);
  if (doc['calendar-query'] !== undefined) {
    const q = doc['calendar-query'];
    // On ne supporte que le filtre time-range sur VEVENT — le cas iOS/macOS.
    const range = findTimeRange(q.filter);
    return {
      type: 'calendar-query',
      start: range?.['@_start'] ?? null,
      end: range?.['@_end'] ?? null,
      props: localNames(q.prop),
    };
  }
  if (doc['calendar-multiget'] !== undefined) {
    const m = doc['calendar-multiget'];
    return { type: 'calendar-multiget', hrefs: asArray(m.href).map(String), props: localNames(m.prop) };
  }
  if (doc['sync-collection'] !== undefined) {
    const s = doc['sync-collection'];
    return { type: 'sync-collection', sync_token: String(s['sync-token'] ?? ''), props: localNames(s.prop) };
  }
  return { type: 'unsupported' };
}

/** Descend récursivement les comp-filter pour trouver un time-range. */
function findTimeRange(node: unknown): Record<string, string> | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const obj = node as Record<string, unknown>;
  if (obj['time-range']) return asArray(obj['time-range'])[0] as Record<string, string>;
  for (const child of asArray(obj['comp-filter'])) {
    const found = findTimeRange(child);
    if (found) return found;
  }
  return undefined;
}

function localNames(prop: unknown): string[] {
  if (typeof prop !== 'object' || prop === null) return [];
  return Object.keys(prop).filter((k) => !k.startsWith('@_'));
}

function asArray(v: unknown): unknown[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
