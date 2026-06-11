/**
 * Crée un jeton d'accès (app password) : npm run token -- <label>
 * Affiche le secret UNE SEULE FOIS — seul le hash est stocké.
 */

import { randomBytes } from 'node:crypto';
import { hashSecret } from '../src/protocol/auth.js';
import { openDb, nowIso } from '../src/store/db.js';

const label = process.argv[2];
if (!label) {
  console.error('Usage: npm run token -- <label>   (ex: iphone-vincent, agent-ia)');
  process.exit(1);
}

const db = openDb(process.env['AGENT_DB'] ?? 'data/agent.db');
const secret = randomBytes(18).toString('base64url');
db.prepare(
  `INSERT INTO auth_tokens (label, secret_hash, created_at) VALUES (?, ?, ?)
   ON CONFLICT (label) DO UPDATE SET secret_hash = excluded.secret_hash`
).run(label, hashSecret(secret), nowIso());

console.log(`Jeton créé/renouvelé pour « ${label} »`);
console.log(`  identifiant : ${label}`);
console.log(`  mot de passe : ${secret}`);
