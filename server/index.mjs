import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { openDb, COLLECTIONS } from './db.mjs';

const db = openDb();

const getStmt = db.prepare(
  'SELECT data, updated_at, deleted FROM items WHERE collection = ? AND key = ?'
);
const upsertStmt = db.prepare(`
  INSERT INTO items (collection, key, data, updated_at, deleted)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(collection, key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at,
    deleted = excluded.deleted
`);
const allStmt = db.prepare('SELECT collection, key, data, updated_at, deleted FROM items');

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, service: 'phomymo-sync' }));

app.get('/api/state', (c) => {
  const state = Object.fromEntries(COLLECTIONS.map((name) => [name, {}]));
  for (const row of allStmt.all()) {
    if (!state[row.collection]) continue;
    state[row.collection][row.key] = {
      data: row.data === null ? null : JSON.parse(row.data),
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
    };
  }
  return c.json(state);
});

app.put('/api/items/:collection/:key', async (c) => {
  const collection = c.req.param('collection');
  const key = c.req.param('key');
  if (!COLLECTIONS.includes(collection)) {
    return c.json({ error: 'unknown collection' }, 400);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (!Number.isFinite(body.updatedAt)) {
    return c.json({ error: 'updatedAt required' }, 400);
  }

  const row = getStmt.get(collection, key);
  if (row && row.updated_at >= body.updatedAt) {
    // Incoming is older or equal: keep the stored record. Not an error — the
    // client clears its dirty flag and picks up the winner at next reconcile.
    return c.json({
      applied: false,
      current: {
        data: row.data === null ? null : JSON.parse(row.data),
        updatedAt: row.updated_at,
        deleted: row.deleted === 1,
      },
    });
  }

  const deleted = body.deleted === true;
  upsertStmt.run(
    collection,
    key,
    deleted ? null : JSON.stringify(body.data ?? null),
    body.updatedAt,
    deleted ? 1 : 0
  );
  return c.json({ applied: true });
});

if (process.env.PHOMYMO_TEST === '1') {
  app.post('/api/testing/reset', (c) => {
    db.exec('DELETE FROM items');
    return c.json({ ok: true });
  });
}

app.use('/*', serveStatic({ root: './src/web' }));

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`phomymo-sync listening on http://localhost:${info.port}`);
});
