/** GET / PUT / DELETE sur une ressource objet : /calendars/{uri}/{href} */

import type { Calendar } from '../../core/models.js';
import type { ObjectRepo } from '../../core/ports.js';
import {
  ObjectService,
  PreconditionFailed,
  ReadOnlyCalendar,
} from '../../core/services/object-service.js';
import type { DavResponse } from './propfind.js';

export function handleGet(cal: Calendar, href: string, objects: ObjectRepo): DavResponse {
  const obj = objects.findByHref(cal.id, href);
  if (!obj || obj.deleted_at) return { status: 404 };
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      ETag: `"${obj.etag}"`,
    },
    body: obj.ical,
  };
}

export function handlePut(
  cal: Calendar,
  href: string,
  body: string,
  ifMatch: string | undefined,
  ifNoneMatch: string | undefined,
  objects: ObjectRepo,
  service: ObjectService
): DavResponse {
  const prev = objects.findByHref(cal.id, href);
  const existed = prev !== undefined && !prev.deleted_at;
  try {
    const etag = service.put(cal, href, body, {
      ...(ifMatch !== undefined ? { if_match: stripQuotes(ifMatch) } : {}),
      if_none_match_any: ifNoneMatch === '*',
    });
    return { status: existed ? 204 : 201, headers: { ETag: `"${etag}"` } };
  } catch (e) {
    if (e instanceof PreconditionFailed) return { status: 412 };
    if (e instanceof ReadOnlyCalendar) return { status: 403 };
    return { status: 400 }; // iCal invalide
  }
}

export function handleDelete(
  cal: Calendar,
  href: string,
  ifMatch: string | undefined,
  service: ObjectService
): DavResponse {
  try {
    const removed = service.delete(cal, href, {
      ...(ifMatch !== undefined ? { if_match: stripQuotes(ifMatch) } : {}),
    });
    return { status: removed ? 204 : 404 };
  } catch (e) {
    if (e instanceof PreconditionFailed) return { status: 412 };
    if (e instanceof ReadOnlyCalendar) return { status: 403 };
    throw e;
  }
}

function stripQuotes(v: string): string {
  return v.replace(/^"|"$/g, '');
}
