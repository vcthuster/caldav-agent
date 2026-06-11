/**
 * Contrats de persistance — implémentés par src/store/repositories/.
 * Le Core ne dépend que de ces interfaces, jamais de better-sqlite3.
 * Tout est synchrone : better-sqlite3 l'est, et c'est un atout (transactions triviales).
 */

import type { Calendar, CalendarObject, Subscription, AuthToken } from './models.js';

export interface CalendarRepo {
  findByUri(uri: string): Calendar | undefined;
  list(): Calendar[];
  /** Incrémente sync_token et le retourne — à appeler dans la même transaction que les mutations. */
  bumpSyncToken(calendar_id: number): number;
}

export interface ObjectRepo {
  findByHref(calendar_id: number, href: string): CalendarObject | undefined;
  /** Objets vivants du calendrier (tombstones exclus). */
  listAlive(calendar_id: number): CalendarObject[];
  /** Index léger (uid -> etag) pour la réconciliation, sans charger les blobs. */
  etagIndex(calendar_id: number): Map<string, string>;
  /** Changements depuis un token, tombstones inclus (RFC 6578). */
  changedSince(calendar_id: number, sync_token: number): CalendarObject[];
  upsert(obj: Omit<CalendarObject, 'id'>): void;
  /** Pose un tombstone (deleted_at + sync_token), ne supprime pas la ligne. */
  tombstone(calendar_id: number, href: string, sync_token: number): void;
}

export interface SubscriptionRepo {
  /** Abonnements dont last_sync_at + sync_interval_s est échu. */
  listDue(now_iso: string): Subscription[];
  update(sub: Subscription): void;
}

export interface AuthTokenRepo {
  findByLabel(label: string): AuthToken | undefined;
  touch(id: number, now_iso: string): void;
}

/** Exécute fn atomiquement (wrapper de db.transaction). */
export type RunInTransaction = <T>(fn: () => T) => T;
