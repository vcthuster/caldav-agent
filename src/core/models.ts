/** Modèles du domaine — miroirs stricts des lignes SQLite (snake_case = données). */

export interface Calendar {
  id: number;
  uri: string;
  display_name: string;
  color: string | null;
  timezone: string;
  is_subscription: 0 | 1;
  sync_token: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarObject {
  id: number;
  calendar_id: number;
  uid: string;
  href: string;
  etag: string;
  ical: string;
  summary: string | null;
  dtstart_utc: string | null;
  dtend_utc: string | null;
  is_recurring: 0 | 1;
  deleted_at: string | null;
  sync_token: number;
  updated_at: string;
}

export interface Subscription {
  id: number;
  calendar_id: number;
  url: string;
  sync_interval_s: number;
  http_etag: string | null;
  http_last_modified: string | null;
  content_hash: string | null;
  last_sync_at: string | null;
  last_status: string | null;
}

export interface AuthToken {
  id: number;
  label: string;
  secret_hash: string;
  created_at: string;
  last_used_at: string | null;
}
