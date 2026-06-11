# TASKS — caldav-agent

## Étape 0 — Fondations
- [x] Arborescence, tsconfig strict, package.json (better-sqlite3, fast-xml-parser, ical.js)
- [x] Schéma SQLite 001-init (calendars, calendar_objects, subscriptions, auth_tokens)
- [x] Types du Core : models, ports (repos), bus d'événements, contrat plugin
- [x] `store/db.ts` : ouverture better-sqlite3, PRAGMA WAL + foreign_keys, runner de migrations
- [x] Repositories SQLite implémentant `core/ports.ts`

## Étape 1 — Serveur CalDAV (clients Apple + Thunderbird)
- [x] `protocol/server.ts` : node:http, routage par verbe, Basic Auth (scrypt vs auth_tokens)
- [x] Redirect `/.well-known/caldav` + PROPFIND principal (current-user-principal, calendar-home-set)
- [x] PROPFIND collections : ctag (= sync_token), displayname, supported-components
- [x] PUT / DELETE avec If-Match / If-None-Match (etag) — vérifié curl : 201/204/412/404
- [x] REPORT calendar-query (time-range ; filtrage sur colonnes dénormalisées, sur-inclusif
      pour les récurrences sans fin — expansion RRULE fine à faire si besoin)
- [x] REPORT calendar-multiget
- [x] REPORT sync-collection (RFC 6578, tombstones) — vérifié : tombstone => 404 + nouveau token
- [x] Script `npm run token -- <label>` (app passwords, scrypt)
- [ ] Test de bout en bout réel : ajout du compte sur macOS/iOS, créer/modifier/supprimer un événement

## Étape 2 — Worker de sync .ics
- [ ] `sync/fetcher.ts` : GET conditionnel (If-None-Match / If-Modified-Since) + sha256
- [ ] `sync/reconciler.ts` : parsing ical.js, groupement par UID (master + RECURRENCE-ID),
      diff par etag, upsert/tombstone en une transaction, bump sync_token unique
- [ ] `sync/scheduler.ts` : boucle setTimeout séquentielle, jitter, backoff sur erreur
- [ ] Cas limites : UID dupliqué (dernier gagne + log), VEVENT sans UID (UID forgé hash DTSTART+SUMMARY)
- [ ] Purge périodique des tombstones anciens

## Plus tard (hors v1)
- [ ] Chargeur de plugins (le contrat `plugins/types.ts` existe déjà)
- [ ] Accès distant : Tailscale ou reverse proxy Caddy (pas de TLS dans le serveur)
