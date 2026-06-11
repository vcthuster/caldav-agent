/** PROPFIND : découverte du principal, listing des calendriers et de leurs objets. */

import type { CalendarRepo, ObjectRepo } from '../../core/ports.js';
import { multistatus, type PropstatResponse } from '../xml/builder.js';
import { parsePropfind } from '../xml/parser.js';
import { calendarResolver, objectHref, objectResolver, principalResolver, resolveProps } from './props.js';

export interface DavResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' };

// Corps vide ou allprop : le set servi par défaut, suffisant pour la découverte.
const DEFAULT_PROPS = ['resourcetype', 'displayname', 'current-user-principal', 'getctag', 'getetag'];

export function handlePropfind(
  path: string,
  depth: string,
  body: string,
  calendars: CalendarRepo,
  objects: ObjectRepo
): DavResponse {
  const requested = parsePropfind(body).props;
  const props = requested.length ? requested : DEFAULT_PROPS;
  const responses: PropstatResponse[] = [];

  if (path === '/' || path === '/principals/' || path === '/principals/me/') {
    responses.push(resolveProps(path, props, principalResolver));
  } else if (path === '/calendars/') {
    responses.push(resolveProps(path, props, principalResolver));
    if (depth !== '0')
      for (const cal of calendars.list())
        responses.push(resolveProps(`/calendars/${cal.uri}/`, props, calendarResolver(cal)));
  } else {
    const m = /^\/calendars\/([^/]+)\/$/.exec(path);
    const cal = m?.[1] ? calendars.findByUri(m[1]) : undefined;
    if (!cal) return { status: 404 };
    responses.push(resolveProps(path, props, calendarResolver(cal)));
    if (depth !== '0')
      for (const obj of objects.listAlive(cal.id))
        responses.push(resolveProps(objectHref(cal.uri, obj.href), props, objectResolver(obj)));
  }

  return { status: 207, headers: XML_HEADERS, body: multistatus(responses) };
}
