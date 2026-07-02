# caldav-agent

Minimalist self-hosted CalDAV server with external iCalendar feed aggregation and a JSON API. Designed to run continuously on small hardware (mini-PC, Raspberry Pi…) with a low CPU/RAM footprint.

- **Native CalDAV server**: works with Apple clients (iOS, macOS) and Thunderbird — auto-discovery, incremental sync (RFC 6578), etags/ctags.
- **`.ics` subscriptions**: periodically pulls external feeds (university timetable, team calendar…) and exposes them as read-only calendars, synced across all your devices.
- **JSON API**: the same data available over REST for your scripts and integrations.
- **Lightweight**: strict TypeScript, SQLite (better-sqlite3), three dependencies, no HTTP framework.

## Getting started

```bash
npm install
npm run token -- iphone        # creates a username + password (shown only once)
npm run dev                    # server on port 5232
```

Environment variables: `AGENT_PORT` (default `5232`), `AGENT_DB` (default `data/agent.db`).

### Connecting an Apple device

Settings → Calendar → Accounts → Other → **CalDAV account**:
server `http://<machine-ip>:5232`, username and password = the token created above.
Each device gets its own token, revocable independently.

### Subscribing to an external .ics feed

```bash
npm run subscribe -- https://example.org/timetable.ics uni "Timetable" 3600
```

The feed is re-synced every `3600` seconds (conditional GET + content hash: an unchanged feed costs next to nothing). It shows up as a read-only calendar on every connected client. `npx tsx scripts/sync-once.ts` forces an immediate pass.

## JSON API

Same data, same authentication (Basic), for programmatic use:

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/calendars` | List calendars |
| `GET` | `/api/events?start=&end=&calendar=` | Events within a time window (ISO 8601) |
| `POST` | `/api/events` | Create an event: `{summary, start, end, calendar?, description?, location?}` |
| `PUT` | `/api/events/{calendar}/{href}` | Update an event (partial): `{summary?, start?, end?, description?, location?, etag?}` |
| `DELETE` | `/api/events/{calendar}/{href}` | Delete an event |

```bash
curl -u mytoken:secret 'http://localhost:5232/api/events?start=2026-06-01T00:00:00Z&end=2026-07-01T00:00:00Z'
```

Writes made through the API are immediately visible to CalDAV clients, and vice versa.

## Architecture

```
src/
├── core/        # pure domain: models, ports, services, event bus
├── protocol/    # HTTP adapter: CalDAV (PROPFIND/REPORT/PUT/DELETE) + JSON API
├── sync/        # .ics feed sync worker
└── store/       # SQLite: migrations + repositories
```

The iCal blob is the source of truth; SQLite only indexes what queries need. Deletions are tombstones, which enables incremental `sync-collection`. A single monotonic counter per calendar serves as both ctag and sync-token.

## Security

Basic authentication with revocable tokens (scrypt-hashed, one token per client). The server does not terminate TLS: on a LAN this is usually acceptable; for remote access, put it behind [Tailscale](https://tailscale.com) or a reverse proxy (Caddy, nginx).

## License

MIT
