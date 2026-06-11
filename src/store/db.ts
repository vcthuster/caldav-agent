/**
 * Ouverture de la BDD + migrations.
 * Les migrations sont des fichiers NNN-*.sql appliqués dans l'ordre ;
 * PRAGMA user_version mémorise la dernière appliquée.
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (version <= current) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.pragma(`user_version = ${version}`);
    })();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
