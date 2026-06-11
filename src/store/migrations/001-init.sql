-- 001-init : schéma fondateur.
-- Principe : le blob iCal est la source de vérité ; les colonnes extraites
-- (dtstart_utc, summary…) ne servent qu'au requêtage, jamais à la restitution.

CREATE TABLE calendars (
  id              INTEGER PRIMARY KEY,
  uri             TEXT NOT NULL UNIQUE,       -- segment d'URL : /calendars/{uri}/
  display_name    TEXT NOT NULL,
  color           TEXT,                       -- format Apple : #RRGGBBAA
  timezone        TEXT NOT NULL DEFAULT 'Europe/Paris',
  is_subscription INTEGER NOT NULL DEFAULT 0, -- 1 = read-only, alimenté par le worker de sync
  -- Compteur monotone incrémenté à chaque mutation du calendrier.
  -- Sert à la fois de ctag (PROPFIND) et de token RFC 6578 (sync-collection).
  sync_token      INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,              -- ISO 8601 UTC partout
  updated_at      TEXT NOT NULL
);

CREATE TABLE calendar_objects (
  id           INTEGER PRIMARY KEY,
  calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  uid          TEXT NOT NULL,                 -- UID iCalendar : clé d'idempotence de la sync
  href         TEXT NOT NULL,                 -- nom de ressource : '{slug}.ics'
  etag         TEXT NOT NULL,                 -- sha1 du blob ical (servi entre guillemets côté HTTP)
  ical         TEXT NOT NULL,                 -- VCALENDAR complet (master + overrides RECURRENCE-ID)
  summary      TEXT,
  dtstart_utc  TEXT,                          -- 1re occurrence, ISO UTC — index time-range
  dtend_utc    TEXT,                          -- NULL si récurrence sans fin (toujours candidat au filtre)
  is_recurring INTEGER NOT NULL DEFAULT 0,
  -- Tombstone : la ligne survit à la suppression pour répondre aux sync-collection,
  -- purgée périodiquement (un token trop ancien => resync complet, prévu par la RFC).
  deleted_at   TEXT,
  sync_token   INTEGER NOT NULL,              -- valeur du token du calendrier au dernier changement
  updated_at   TEXT NOT NULL,
  UNIQUE (calendar_id, href)
);

CREATE INDEX idx_obj_timerange  ON calendar_objects (calendar_id, dtstart_utc, dtend_utc);
CREATE INDEX idx_obj_uid        ON calendar_objects (calendar_id, uid);
CREATE INDEX idx_obj_sync_token ON calendar_objects (calendar_id, sync_token);

CREATE TABLE subscriptions (
  id                 INTEGER PRIMARY KEY,
  calendar_id        INTEGER NOT NULL UNIQUE REFERENCES calendars(id) ON DELETE CASCADE,
  url                TEXT NOT NULL,
  sync_interval_s    INTEGER NOT NULL DEFAULT 3600,
  -- Trois étages d'économie, du moins cher au plus cher :
  http_etag          TEXT,                    -- -> If-None-Match (304 = zéro octet transféré)
  http_last_modified TEXT,                    -- -> If-Modified-Since (fallback sans ETag)
  content_hash       TEXT,                    -- sha256 du corps : identique => zéro parsing
  last_sync_at       TEXT,
  last_status        TEXT                     -- 'ok' | 'unchanged' | 'error: …'
);

-- Modèle « app password » : un jeton Basic Auth révocable par client
-- (iphone, macbook, agent-ia…). username = label, password = secret.
-- secret_hash : scrypt via node:crypto, format 'salt:hash' hex.
CREATE TABLE auth_tokens (
  id           INTEGER PRIMARY KEY,
  label        TEXT NOT NULL UNIQUE,
  secret_hash  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);
