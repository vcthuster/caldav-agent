/**
 * Récupération d'un flux .ics avec trois étages d'économie :
 * GET conditionnel (304), puis hash de contenu (zéro parsing si identique).
 */

import { createHash } from 'node:crypto';
import type { Subscription } from '../core/models.js';

export type FetchResult =
  | { kind: 'unchanged' }
  | { kind: 'changed'; body: string; http_etag: string | null; http_last_modified: string | null; content_hash: string }
  | { kind: 'error'; message: string };

export async function fetchFeed(sub: Subscription): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  if (sub.http_etag) headers['If-None-Match'] = sub.http_etag;
  if (sub.http_last_modified) headers['If-Modified-Since'] = sub.http_last_modified;

  let res: Response;
  try {
    res = await fetch(sub.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === 304) return { kind: 'unchanged' };
  if (!res.ok) return { kind: 'error', message: `HTTP ${res.status}` };

  const body = await res.text();
  const content_hash = createHash('sha256').update(body).digest('hex');
  if (content_hash === sub.content_hash) return { kind: 'unchanged' };

  return {
    kind: 'changed',
    body,
    http_etag: res.headers.get('etag'),
    http_last_modified: res.headers.get('last-modified'),
    content_hash,
  };
}
