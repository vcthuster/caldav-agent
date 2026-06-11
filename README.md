# caldav-agent

Serveur CalDAV minimaliste et auto-hébergé, avec agrégation de flux iCalendar externes et API JSON. Conçu pour tourner en continu sur une petite machine (mini-PC, Raspberry Pi…) avec une empreinte CPU/RAM réduite.

- **Serveur CalDAV natif** : compatible avec les clients Apple (iOS, macOS) et Thunderbird — découverte automatique, synchronisation incrémentale (RFC 6578), etags/ctags.
- **Abonnements `.ics`** : aspire périodiquement des flux externes (emploi du temps universitaire, calendrier d'équipe…) et les expose comme des calendriers en lecture seule, synchronisés sur tous vos appareils.
- **API JSON** : les mêmes données accessibles en REST pour vos scripts et intégrations.
- **Léger** : TypeScript strict, SQLite (better-sqlite3), trois dépendances, pas de framework HTTP.

## Démarrage

```bash
npm install
npm run token -- iphone        # crée un identifiant + mot de passe (affiché une seule fois)
npm run dev                    # serveur sur le port 5232
```

Variables d'environnement : `AGENT_PORT` (défaut `5232`), `AGENT_DB` (défaut `data/agent.db`).

### Connecter un appareil Apple

Réglages → Calendrier → Comptes → Autre → **Compte CalDAV** :
serveur `http://<ip-machine>:5232`, identifiant et mot de passe = le jeton créé ci-dessus.
Chaque appareil reçoit son propre jeton, révocable indépendamment.

### S'abonner à un flux .ics externe

```bash
npm run subscribe -- https://exemple.fr/edt.ics fac "Emploi du temps" 3600
```

Le flux est resynchronisé toutes les `3600` secondes (GET conditionnel + hash de contenu : un flux inchangé ne coûte presque rien). Il apparaît comme calendrier en lecture seule sur tous les clients connectés. `npx tsx scripts/sync-once.ts` force une passe immédiate.

## API JSON

Mêmes données, même authentification (Basic), pour un usage programmatique :

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/calendars` | Liste des calendriers |
| `GET` | `/api/events?start=&end=&calendar=` | Événements d'une fenêtre temporelle (ISO 8601) |
| `POST` | `/api/events` | Crée un événement : `{summary, start, end, calendar?, description?, location?}` |
| `DELETE` | `/api/events/{calendar}/{href}` | Supprime un événement |

```bash
curl -u monjeton:secret 'http://localhost:5232/api/events?start=2026-06-01T00:00:00Z&end=2026-07-01T00:00:00Z'
```

Les écritures faites via l'API sont immédiatement visibles par les clients CalDAV, et réciproquement.

## Architecture

```
src/
├── core/        # domaine pur : modèles, ports, services, bus d'événements
├── protocol/    # adaptateur HTTP : CalDAV (PROPFIND/REPORT/PUT/DELETE) + API JSON
├── sync/        # worker d'aspiration des flux .ics
└── store/       # SQLite : migrations + repositories
```

Le blob iCal est la source de vérité ; SQLite n'indexe que ce qui sert au requêtage. Les suppressions sont des tombstones, ce qui permet la synchronisation incrémentale `sync-collection`. Un seul compteur monotone par calendrier sert à la fois de ctag et de sync-token.

## Sécurité

Authentification Basic par jetons révocables (hash scrypt en base, un jeton par client). Le serveur ne fait pas de TLS : sur un LAN c'est généralement acceptable ; pour un accès distant, placez-le derrière [Tailscale](https://tailscale.com) ou un reverse proxy (Caddy, nginx).

## Licence

MIT
