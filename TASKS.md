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
- [x] `sync/fetcher.ts` : GET conditionnel (If-None-Match / If-Modified-Since) + sha256
- [x] `sync/reconciler.ts` : ical.js, groupement par UID (master + RECURRENCE-ID),
      diff par etag, upsert/tombstone via ObjectService — vérifié : +2/-1 puis 'unchanged'
- [x] `sync/scheduler.ts` : tick 60s séquentiel ; l'intervalle d'abonnement sert de backoff
      (pas de backoff exponentiel dédié — à ajouter si un flux instable le justifie)
- [x] VEVENT sans UID : UID forgé depuis DTSTART+SUMMARY — vérifié
- [x] Scripts : `npm run subscribe -- <url> <uri> "<nom>" [s]`, `npx tsx scripts/sync-once.ts`
- [ ] Purge périodique des tombstones anciens

## Étape 3 — API JSON (intégrations programmatiques)
- [x] `protocol/api.ts` : GET /api/calendars, GET/POST /api/events, DELETE — via ObjectService
      (ctag/tombstones/bus corrects, écritures visibles côté CalDAV) — vérifié curl + plugin
- [x] `core/ical.ts` buildEvent : génération VEVENT simple (UTC)
- [x] README.md (présentation agnostique : CalDAV + abonnements + API JSON)

## Plus tard (hors v1)
- [ ] Chargeur de plugins (le contrat `plugins/types.ts` existe déjà)
- [ ] Accès distant : Tailscale ou reverse proxy Caddy (pas de TLS dans le serveur)
