import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Collections the sync API accepts. Must match the registry in src/web/sync.js.
export const COLLECTIONS = ['designs', 'multi_label_presets', 'custom_printers'];

export function openDb() {
  const path = process.env.PHOMYMO_DB
    || (process.env.PHOMYMO_TEST === '1' ? ':memory:' : join(import.meta.dirname, 'data', 'phomymo.sqlite'));

  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      collection TEXT    NOT NULL,
      key        TEXT    NOT NULL,
      data       TEXT,                 -- JSON string; NULL when deleted (tombstone)
      updated_at INTEGER NOT NULL,     -- ms epoch, client-supplied (last-write-wins)
      deleted    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection, key)
    );
  `);
  return db;
}
