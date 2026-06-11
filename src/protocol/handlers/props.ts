/**
 * Catalogue des propriétés WebDAV/CalDAV servies, par type de ressource.
 * Chaque résolveur retourne le fragment XML interne (déjà échappé) ou
 * undefined si la propriété n'existe pas pour cette ressource (=> 404 propstat).
 */

import { formatSyncToken } from '../../core/etag.js';
import type { Calendar, CalendarObject } from '../../core/models.js';
import { xmlEscape, type PropstatResponse } from '../xml/builder.js';

/** nom local -> nom préfixé tel qu'émis dans le multistatus. */
const PREFIXED: Record<string, string> = {
  resourcetype: 'd:resourcetype',
  displayname: 'd:displayname',
  'current-user-principal': 'd:current-user-principal',
  'principal-URL': 'd:principal-URL',
  'calendar-home-set': 'c:calendar-home-set',
  'supported-calendar-component-set': 'c:supported-calendar-component-set',
  'calendar-data': 'c:calendar-data',
  getctag: 'cs:getctag',
  'sync-token': 'd:sync-token',
  getetag: 'd:getetag',
  getcontenttype: 'd:getcontenttype',
  'calendar-color': 'ic:calendar-color',
};

type Resolver = (name: string) => string | undefined;

/** Construit une PropstatResponse en résolvant chaque propriété demandée. */
export function resolveProps(href: string, requested: string[], resolve: Resolver): PropstatResponse {
  const found: Record<string, string> = {};
  const notFound: string[] = [];
  for (const name of requested) {
    const value = resolve(name);
    const prefixed = PREFIXED[name] ?? `d:${name}`;
    if (value !== undefined) found[prefixed] = value;
    else notFound.push(prefixed);
  }
  return { href, found, notFound };
}

export const principalResolver: Resolver = (name) => {
  switch (name) {
    case 'resourcetype': return '<d:collection/><d:principal/>';
    case 'displayname': return 'caldav-agent';
    case 'current-user-principal':
    case 'principal-URL': return '<d:href>/principals/me/</d:href>';
    case 'calendar-home-set': return '<d:href>/calendars/</d:href>';
    default: return undefined;
  }
};

export function calendarResolver(cal: Calendar): Resolver {
  return (name) => {
    switch (name) {
      case 'resourcetype': return '<d:collection/><c:calendar/>';
      case 'displayname': return xmlEscape(cal.display_name);
      case 'getctag': return xmlEscape(formatSyncToken(cal.sync_token));
      case 'sync-token': return xmlEscape(formatSyncToken(cal.sync_token));
      case 'supported-calendar-component-set': return '<c:comp name="VEVENT"/>';
      case 'calendar-color': return cal.color ? xmlEscape(cal.color) : undefined;
      case 'current-user-principal': return '<d:href>/principals/me/</d:href>';
      default: return undefined;
    }
  };
}

export function objectResolver(obj: CalendarObject): Resolver {
  return (name) => {
    switch (name) {
      case 'resourcetype': return ''; // ressource simple, pas une collection
      case 'getetag': return `&quot;${obj.etag}&quot;`;
      case 'getcontenttype': return 'text/calendar; charset=utf-8; component=VEVENT';
      case 'calendar-data': return xmlEscape(obj.ical);
      default: return undefined;
    }
  };
}

export function objectHref(calendarUri: string, href: string): string {
  return `/calendars/${calendarUri}/${href}`;
}
