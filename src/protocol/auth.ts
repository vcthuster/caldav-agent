/**
 * Basic Auth contre la table auth_tokens (modèle « app password » :
 * username = label du jeton, password = secret).
 * Hash scrypt format 'saltHex:hashHex', comparaison à temps constant.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AuthTokenRepo } from '../core/ports.js';

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(secret, salt, 32).toString('hex')}`;
}

function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const computed = scryptSync(secret, Buffer.from(saltHex, 'hex'), 32);
  return timingSafeEqual(computed, Buffer.from(hashHex, 'hex'));
}

/** Retourne le label du client authentifié, ou null (=> 401). */
export function authenticate(req: IncomingMessage, tokens: AuthTokenRepo): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  const label = decoded.slice(0, sep);
  const secret = decoded.slice(sep + 1);
  const token = tokens.findByLabel(label);
  if (!token || !verifySecret(secret, token.secret_hash)) return null;
  tokens.touch(token.id, new Date().toISOString());
  return label;
}
