/**
 * Construction des réponses 207 Multi-Status.
 * Préfixes fixes : d=DAV:, c=CALDAV, cs=calendarserver.org (ctag),
 * ic=Apple iCal (couleur de calendrier).
 */

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PropstatResponse {
  href: string;
  /** Propriétés trouvées : nom local préfixé -> fragment XML déjà échappé. */
  found: Record<string, string>;
  /** Noms (préfixés) des propriétés demandées mais inconnues -> 404. */
  notFound: string[];
  /** Statut global de la response (ex: tombstone sync-collection) — exclusif des propstats. */
  status?: string;
}

export function multistatus(responses: PropstatResponse[], syncToken?: string): string {
  const body = responses.map(renderResponse).join('');
  const token = syncToken ? `<d:sync-token>${xmlEscape(syncToken)}</d:sync-token>` : '';
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"' +
    ' xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">' +
    body +
    token +
    '</d:multistatus>'
  );
}

function renderResponse(r: PropstatResponse): string {
  const href = `<d:href>${xmlEscape(r.href)}</d:href>`;
  if (r.status) return `<d:response>${href}<d:status>HTTP/1.1 ${r.status}</d:status></d:response>`;

  const found = Object.entries(r.found)
    .map(([name, inner]) => `<${name}>${inner}</${name}>`)
    .join('');
  const ok = found
    ? `<d:propstat><d:prop>${found}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`
    : '';
  const missing = r.notFound.length
    ? `<d:propstat><d:prop>${r.notFound.map((n) => `<${n}/>`).join('')}</d:prop>` +
      '<d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>'
    : '';
  return `<d:response>${href}${ok}${missing}</d:response>`;
}
