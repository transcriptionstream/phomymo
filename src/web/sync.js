/**
 * Server sync layer: write-through localStorage cache with background push
 * and startup last-write-wins reconcile against the sync server's API.
 *
 * localStorage remains the synchronous source of truth for all reads. The
 * other modules call markUpserted/markDeleted after their localStorage
 * writes; this module tracks per-item sync state and flushes to the server
 * in the background. When no server is present (static hosting), initSync
 * goes dormant and the app behaves exactly as before — mutations are still
 * recorded so they push on a later visit where a server exists.
 *
 * IMPORTANT (module identity): this file must be imported with the
 * byte-identical specifier './sync.js?v=1' from every importer (app.js,
 * storage.js, printer.js). Differing ?v= strings would load separate copies
 * of this module with separate timers and state. When bumping the version,
 * bump it in ALL importers in the same commit.
 *
 * The storage keys below are deliberately duplicated from constants.js
 * rather than imported: constants.js is imported bare (unversioned) by
 * storage.js/printer.js but versioned by app.js, so importing it here would
 * add a third module instance and another stale-cache hazard.
 */

const META_KEY = 'phomymo_sync_meta';
const FLUSH_DEBOUNCE_MS = 500;
const RETRY_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2000;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`[sync] failed to read ${key}:`, e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[sync] failed to write ${key}:`, e);
    return false;
  }
}

/**
 * Per-collection adapters over the localStorage shapes owned by other
 * modules: designs and presets are maps (name -> object), custom printers
 * is an array of definitions keyed by .id.
 */
const COLLECTIONS = {
  designs: mapAdapter('phomymo_designs'),
  multi_label_presets: mapAdapter('phomymo_multi_label_presets'),
  custom_printers: arrayAdapter('phomymo_custom_printers', 'id'),
};

function mapAdapter(storageKey) {
  return {
    storageKey,
    keys() { return Object.keys(readJson(storageKey, {})); },
    get(key) { return readJson(storageKey, {})[key] ?? null; },
    set(key, value) {
      const map = readJson(storageKey, {});
      map[key] = value;
      writeJson(storageKey, map);
    },
    remove(key) {
      const map = readJson(storageKey, {});
      if (!(key in map)) return;
      delete map[key];
      writeJson(storageKey, map);
    },
  };
}

function arrayAdapter(storageKey, idField) {
  return {
    storageKey,
    keys() { return readJson(storageKey, []).map((item) => item[idField]); },
    get(key) { return readJson(storageKey, []).find((item) => item[idField] === key) ?? null; },
    set(key, value) {
      const arr = readJson(storageKey, []);
      const idx = arr.findIndex((item) => item[idField] === key);
      if (idx >= 0) arr[idx] = value; else arr.push(value);
      writeJson(storageKey, arr);
    },
    remove(key) {
      const arr = readJson(storageKey, []);
      const filtered = arr.filter((item) => item[idField] !== key);
      if (filtered.length !== arr.length) writeJson(storageKey, filtered);
    },
  };
}

// ---------------------------------------------------------------------------
// Sync metadata. One localStorage blob doubling as the outbox:
//   { designs: { "Shelf Label": { t: 1751791234567, del: 0, dirty: 1 } }, ... }
// t = LWW timestamp (ms), del = tombstone, dirty = pending push (cleared on
// server 2xx). Acked tombstones are kept: they are tiny and guard against
// deleted items being resurrected during reconcile.
// ---------------------------------------------------------------------------

function readMeta() {
  const meta = readJson(META_KEY, {});
  for (const name of Object.keys(COLLECTIONS)) {
    if (!meta[name]) meta[name] = {};
  }
  return meta;
}

let active = false;
let offline = false;
let flushing = false;
let flushQueued = false;
let flushTimer = null;
let retryTimer = null;
let statusCb = () => {};
let refreshCbs = {};

function mark(collection, key, del) {
  if (!COLLECTIONS[collection]) {
    console.warn(`[sync] unknown collection: ${collection}`);
    return;
  }
  const meta = readMeta();
  meta[collection][key] = { t: Date.now(), del: del ? 1 : 0, dirty: 1 };
  writeJson(META_KEY, meta);
  scheduleFlush();
}

/** Record that an item was created or updated in localStorage. */
export function markUpserted(collection, key) {
  mark(collection, key, false);
}

/** Record that an item was deleted from localStorage. */
export function markDeleted(collection, key) {
  mark(collection, key, true);
}

/**
 * Probe for the sync server; if present, reconcile and start flushing.
 * @param {object} opts
 * @param {(msg: string) => void} [opts.onStatus] - status bar callback
 * @param {Object<string, () => void>} [opts.refresh] - per-collection UI
 *   refresh hooks, called after a startup pull changes that collection
 */
export async function initSync({ onStatus, refresh } = {}) {
  statusCb = onStatus || (() => {});
  refreshCbs = refresh || {};

  let healthy = false;
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.ok) {
      const body = await res.json();
      healthy = body && body.ok === true;
    }
  } catch {
    // No server (or an SPA fallback returned non-JSON) — stay dormant.
  }

  if (!healthy) {
    console.info('[sync] no server detected; running local-only');
    return;
  }

  active = true;
  window.addEventListener('online', scheduleFlush);

  try {
    await reconcile();
  } catch (e) {
    console.warn('[sync] startup reconcile failed:', e);
    setOffline(true);
    scheduleRetry();
    return;
  }

  await flush();
}

/**
 * Startup reconcile: seed metadata for never-synced local items (this is
 * also the first-run migration), pull server state, merge per item by
 * last-write-wins, then push anything local-newer via flush().
 */
async function reconcile() {
  // 1. Pull full server state (includes tombstones). Done before reading
  //    meta so there is no await between the meta read and write below —
  //    a markUpserted landing mid-fetch would otherwise be clobbered.
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`GET /api/state -> ${res.status}`);
  const state = await res.json();

  const meta = readMeta();

  // 2. Seed meta for pre-existing local items that sync has never seen.
  for (const [name, adapter] of Object.entries(COLLECTIONS)) {
    for (const key of adapter.keys()) {
      if (!meta[name][key]) {
        const savedAt = name === 'designs' ? adapter.get(key)?.savedAt : null;
        meta[name][key] = { t: savedAt || Date.now(), del: 0, dirty: 1 };
      }
    }
  }

  // 3. Merge per item.
  const changed = new Set();
  for (const [name, adapter] of Object.entries(COLLECTIONS)) {
    const serverItems = state[name] || {};
    const keys = new Set([...Object.keys(serverItems), ...Object.keys(meta[name])]);
    for (const key of keys) {
      const server = serverItems[key];
      const local = meta[name][key];
      const localT = local?.t ?? 0;

      if (server && server.updatedAt > localT) {
        // Server wins: apply to localStorage and mark clean.
        if (server.deleted) {
          if (adapter.get(key) !== null) changed.add(name);
          adapter.remove(key);
        } else {
          adapter.set(key, server.data);
          changed.add(name);
        }
        meta[name][key] = { t: server.updatedAt, del: server.deleted ? 1 : 0, dirty: 0 };
      } else if (server && server.updatedAt === localT) {
        // In sync (a re-push would be rejected by the server's >= guard).
        meta[name][key].dirty = 0;
      } else if (local) {
        // Local newer, or the server has never seen this item (covers
        // local-only items, offline edits, and offline deletes).
        meta[name][key].dirty = 1;
      }
    }
  }

  writeJson(META_KEY, meta);

  for (const name of changed) {
    try {
      refreshCbs[name]?.();
    } catch (e) {
      console.warn(`[sync] refresh callback for ${name} failed:`, e);
    }
  }
}

function scheduleFlush() {
  if (!active) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

function scheduleRetry() {
  if (!active) return;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flush, RETRY_MS);
}

function setOffline(value) {
  if (value === offline) return;
  offline = value;
  if (value) {
    console.warn('[sync] server unreachable; changes are saved locally and will sync later');
    statusCb('Sync offline — changes saved locally');
  } else {
    statusCb('Synced');
  }
}

/**
 * Clear an entry's dirty flag, but only if its timestamp is unchanged —
 * if the item was re-marked while its PUT was in flight, the new mark
 * must survive to be pushed by the follow-up flush.
 */
function clearDirtyIfUnchanged(name, key, t) {
  const meta = readMeta();
  const entry = meta[name][key];
  if (entry && entry.t === t) {
    entry.dirty = 0;
    writeJson(META_KEY, meta);
  }
}

/**
 * Push all dirty items to the server, sequentially. Values are read from
 * localStorage at flush time, so rapid saves of the same item coalesce into
 * one PUT carrying the latest value.
 */
async function flush() {
  if (!active) return;
  if (flushing) {
    flushQueued = true;
    return;
  }
  flushing = true;

  try {
    let failed = false;

    // Snapshot the dirty set, then re-read each entry fresh before pushing
    // (mutations can land between awaits; meta is never held across one).
    const pending = [];
    const snapshot = readMeta();
    for (const name of Object.keys(COLLECTIONS)) {
      for (const [key, entry] of Object.entries(snapshot[name])) {
        if (entry.dirty) pending.push({ name, key });
      }
    }

    for (const { name, key } of pending) {
      const entry = readMeta()[name][key];
      if (!entry?.dirty) continue;

      let body;
      if (entry.del) {
        body = { deleted: true, updatedAt: entry.t };
      } else {
        const value = COLLECTIONS[name].get(key);
        if (value === null) {
          // Value vanished without a markDeleted — nothing to push.
          clearDirtyIfUnchanged(name, key, entry.t);
          continue;
        }
        body = { data: value, updatedAt: entry.t };
      }

      try {
        const res = await fetch(`/api/items/${name}/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`PUT -> ${res.status}`);
        // applied:false (server had newer) still clears dirty; the server's
        // winner reaches this client at its next startup reconcile.
        clearDirtyIfUnchanged(name, key, entry.t);
      } catch {
        failed = true;
        break;
      }
    }

    setOffline(failed);
    if (failed) scheduleRetry();
  } finally {
    flushing = false;
    if (flushQueued) {
      flushQueued = false;
      scheduleFlush();
    }
  }
}
