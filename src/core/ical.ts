/**
 * Extraction des métadonnées de requêtage depuis un blob VCALENDAR.
 * Le blob reste la source de vérité ; ces champs ne servent qu'aux index SQL.
 */

import ICAL from 'ical.js';

export interface IcalMeta {
  uid: string;
  summary: string | null;
  dtstart_utc: string | null;
  /** null si récurrent : l'objet reste toujours candidat au filtre time-range. */
  dtend_utc: string | null;
  is_recurring: 0 | 1;
}

/** Parse un VCALENDAR et extrait les métadonnées du VEVENT maître.
 *  Jette si le blob est invalide ou ne contient aucun VEVENT. */
export function extractMeta(ical: string): IcalMeta {
  const comp = new ICAL.Component(ICAL.parse(ical));
  const vevents = comp.getAllSubcomponents('vevent');
  // Le maître est le VEVENT sans RECURRENCE-ID ; à défaut, le premier.
  const master = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0];
  if (!master) throw new Error('VCALENDAR sans VEVENT');

  const event = new ICAL.Event(master);
  const is_recurring = event.isRecurring() ? 1 : 0;
  return {
    uid: event.uid,
    summary: event.summary || null,
    dtstart_utc: event.startDate ? event.startDate.toJSDate().toISOString() : null,
    // Récurrent => pas de borne haute fiable sans expansion : on laisse NULL
    // (sur-inclusif au filtrage, jamais faux).
    dtend_utc: is_recurring ? null : event.endDate ? event.endDate.toJSDate().toISOString() : null,
    is_recurring,
  };
}

/** Extrait le lieu et la note (description) du VEVENT maître. Best-effort :
 *  renvoie null/null si le blob est illisible — ne jette jamais (appelé au
 *  rendu de la liste d'événements, où une erreur ne doit pas casser la réponse). */
export function extractDetails(ical: string): { location: string | null; description: string | null } {
  try {
    const comp = new ICAL.Component(ICAL.parse(ical));
    const vevents = comp.getAllSubcomponents('vevent');
    const master = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0];
    if (!master) return { location: null, description: null };
    const event = new ICAL.Event(master);
    return { location: event.location || null, description: event.description || null };
  } catch {
    return { location: null, description: null };
  }
}

/** Regroupe les VEVENT d'un flux par UID (maître + overrides RECURRENCE-ID)
 *  et resérialise chaque groupe en VCALENDAR autonome, VTIMEZONE inclus. */
export function splitFeedByUid(feed: string): Map<string, string> {
  const comp = new ICAL.Component(ICAL.parse(feed));
  const timezones = comp.getAllSubcomponents('vtimezone');
  const groups = new Map<string, ICAL.Component[]>();

  for (const vevent of comp.getAllSubcomponents('vevent')) {
    // Certains exports omettent l'UID : on en forge un, stable tant que
    // l'événement ne change pas (hash implicite via DTSTART+SUMMARY).
    const uid =
      vevent.getFirstPropertyValue('uid')?.toString() ??
      forgeUid(vevent);
    if (!vevent.hasProperty('uid')) vevent.updatePropertyWithValue('uid', uid);
    (groups.get(uid) ?? groups.set(uid, []).get(uid)!).push(vevent);
  }

  const out = new Map<string, string>();
  for (const [uid, events] of groups) {
    const cal = new ICAL.Component(['vcalendar', [], []]);
    cal.updatePropertyWithValue('version', '2.0');
    cal.updatePropertyWithValue('prodid', '-//caldav-agent//FR');
    for (const tz of timezones) cal.addSubcomponent(tz);
    for (const ev of events) cal.addSubcomponent(ev);
    out.set(uid, cal.toString());
  }
  return out;
}

export interface NewEvent {
  uid: string;
  summary: string;
  /** ISO 8601 ; stockés en UTC dans le VEVENT. */
  start: string;
  end: string;
  description?: string;
  location?: string;
}

/** Construit un VCALENDAR autonome pour un événement simple (non récurrent). */
export function buildEvent(e: NewEvent): string {
  const vevent = new ICAL.Component('vevent');
  const event = new ICAL.Event(vevent);
  event.uid = e.uid;
  event.summary = e.summary;
  event.startDate = ICAL.Time.fromJSDate(new Date(e.start), true);
  event.endDate = ICAL.Time.fromJSDate(new Date(e.end), true);
  if (e.description) event.description = e.description;
  if (e.location) event.location = e.location;
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));

  const cal = new ICAL.Component(['vcalendar', [], []]);
  cal.updatePropertyWithValue('version', '2.0');
  cal.updatePropertyWithValue('prodid', '-//caldav-agent//FR');
  cal.addSubcomponent(vevent);
  return cal.toString();
}

export interface EventPatch {
  summary?: string;
  /** ISO 8601. */
  start?: string;
  end?: string;
  description?: string;
  location?: string;
}

/** Applique une modification PARTIELLE au VEVENT maître d'un VCALENDAR existant :
 *  ne touche que les champs fournis, préserve l'UID et tout le reste (invités,
 *  alarmes, VTIMEZONE…), incrémente SEQUENCE — sans quoi un client CalDAV peut
 *  ignorer la modif — et rafraîchit DTSTAMP. Jette si le blob n'a pas de VEVENT
 *  maître. Pur. */
export function patchEvent(ical: string, patch: EventPatch): string {
  const comp = new ICAL.Component(ICAL.parse(ical));
  const vevents = comp.getAllSubcomponents('vevent');
  const master = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0];
  if (!master) throw new Error('VCALENDAR sans VEVENT');
  const event = new ICAL.Event(master);

  if (patch.summary !== undefined) event.summary = patch.summary;
  if (patch.start !== undefined) event.startDate = ICAL.Time.fromJSDate(new Date(patch.start), true);
  if (patch.end !== undefined) event.endDate = ICAL.Time.fromJSDate(new Date(patch.end), true);
  if (patch.description !== undefined) event.description = patch.description;
  if (patch.location !== undefined) event.location = patch.location;

  const seq = Number(master.getFirstPropertyValue('sequence') ?? 0);
  master.updatePropertyWithValue('sequence', (Number.isFinite(seq) ? seq : 0) + 1);
  master.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));

  return comp.toString();
}

function forgeUid(vevent: ICAL.Component): string {
  const start = vevent.getFirstPropertyValue('dtstart')?.toString() ?? '';
  const summary = vevent.getFirstPropertyValue('summary')?.toString() ?? '';
  return `forged-${Buffer.from(`${start}|${summary}`).toString('hex').slice(0, 32)}@caldav-agent`;
}
