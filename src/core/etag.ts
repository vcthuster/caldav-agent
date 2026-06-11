import { createHash } from 'node:crypto';

/** etag d'un objet = sha1 de son blob iCal. Servi entre guillemets côté HTTP. */
export function computeEtag(ical: string): string {
  return createHash('sha1').update(ical).digest('hex');
}

/** ctag / sync-token exposé aux clients, dérivé du compteur monotone. */
export function formatSyncToken(token: number): string {
  return `ct-${token}`;
}

/** Inverse de formatSyncToken ; null si le token est étranger ou malformé. */
export function parseSyncToken(value: string): number | null {
  const m = /^ct-(\d+)$/.exec(value.trim());
  return m ? Number(m[1]) : null;
}
