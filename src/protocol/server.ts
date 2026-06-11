/**
 * Serveur HTTP CalDAV : node:http brut, routage par verbe.
 * Espace d'URL :
 *   /.well-known/caldav        -> redirect / (découverte automatique iOS)
 *   /, /principals/me/         -> PROPFIND découverte du principal
 *   /calendars/                -> PROPFIND home-set
 *   /calendars/{uri}/          -> PROPFIND / REPORT
 *   /calendars/{uri}/{href}    -> GET / PUT / DELETE
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AuthTokenRepo, CalendarRepo, ObjectRepo } from '../core/ports.js';
import type { ObjectService } from '../core/services/object-service.js';
import { handleApi } from './api.js';
import { authenticate } from './auth.js';
import { handlePropfind, type DavResponse } from './handlers/propfind.js';
import { handleReport } from './handlers/report.js';
import { handleDelete, handleGet, handlePut } from './handlers/objects.js';

export interface ServerDeps {
  calendars: CalendarRepo;
  objects: ObjectRepo;
  objectService: ObjectService;
  authTokens: AuthTokenRepo;
}

const DAV_HEADERS = {
  DAV: '1, 3, calendar-access',
  Allow: 'OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT',
};

export function createCaldavServer(deps: ServerDeps): Server {
  return createServer((req, res) => {
    void handle(req, res, deps).catch((err) => {
      console.error('[caldav] erreur interne :', err);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: ServerDeps): Promise<void> {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);

  if (path === '/.well-known/caldav') {
    res.writeHead(301, { Location: '/' }).end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(200, DAV_HEADERS).end();
    return;
  }

  const client = authenticate(req, deps.authTokens);
  if (!client) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="caldav-agent"' }).end();
    return;
  }

  const body = await readBody(req);
  const out = path.startsWith('/api/')
    ? handleApi(req.method ?? 'GET', path, new URL(req.url ?? '/', 'http://x').searchParams,
        body, deps.calendars, deps.objects, deps.objectService)
    : route(req, path, body, deps);
  res.writeHead(out.status, { ...DAV_HEADERS, ...out.headers }).end(out.body);
}

function route(req: IncomingMessage, path: string, body: string, deps: ServerDeps): DavResponse {
  const depth = String(req.headers.depth ?? 'infinity');
  const objMatch = /^\/calendars\/([^/]+)\/([^/]+)$/.exec(path);
  const colMatch = /^\/calendars\/([^/]+)\/$/.exec(path);

  if (req.method === 'PROPFIND') return handlePropfind(path, depth, body, deps.calendars, deps.objects);

  if (req.method === 'REPORT' && colMatch?.[1]) {
    const cal = deps.calendars.findByUri(colMatch[1]);
    return cal ? handleReport(cal, body, deps.calendars, deps.objects) : { status: 404 };
  }

  if (objMatch?.[1] && objMatch[2]) {
    const cal = deps.calendars.findByUri(objMatch[1]);
    if (!cal) return { status: 404 };
    const href = objMatch[2];
    const ifMatch = headerValue(req, 'if-match');
    switch (req.method) {
      case 'GET':
      case 'HEAD':
        return handleGet(cal, href, deps.objects);
      case 'PUT':
        return handlePut(cal, href, body, ifMatch, headerValue(req, 'if-none-match'),
          deps.objects, deps.objectService);
      case 'DELETE':
        return handleDelete(cal, href, ifMatch, deps.objectService);
    }
  }

  return { status: 405 };
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
