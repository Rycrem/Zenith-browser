'use strict';

// Préchargement des pages et service workers des extensions : remplace chrome.storage.sync,
// absent d'Electron, par chrome.storage.local (voir storage-sync.js). Fichier autonome
// (les préchargements en bac à sable ne peuvent rien importer) ; le processus principal
// le lit aussi pour écrire la même fonction dans les scripts de contenu.
// Exécutée telle quelle dans le contexte de l'extension : rien de l'extérieur n'y est utilisé.
function syncPolyfill() {
  const c = globalThis.chrome;
  if (!c || !c.storage || !c.storage.local || c.storage.__devBrowsSync) return;
  const P = '__dev-brows-sync__:';
  const local = c.storage.local;
  const call = (fn, ...args) => new Promise((resolve, reject) => {
    fn.call(local, ...args, (result) => {
      const err = c.runtime && c.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
  const prefixed = (keys) => {
    if (keys === null || keys === undefined) return null;
    if (typeof keys === 'string') return P + keys;
    if (Array.isArray(keys)) return keys.map((k) => P + k);
    const out = {};
    for (const [k, v] of Object.entries(keys)) out[P + k] = v;
    return out;
  };
  const strip = (items) => {
    const out = {};
    for (const [k, v] of Object.entries(items || {})) if (k.startsWith(P)) out[k.slice(P.length)] = v;
    return out;
  };
  // Promesse si pas de callback, sinon callback (comme l'API de Chrome).
  const done = (promise, cb) => {
    if (typeof cb !== 'function') return promise;
    promise.then((r) => cb(r), () => cb());
    return undefined;
  };
  const syncListeners = new Set();
  const sync = {
    QUOTA_BYTES: 102400,
    QUOTA_BYTES_PER_ITEM: 8192,
    MAX_ITEMS: 512,
    MAX_WRITE_OPERATIONS_PER_HOUR: 1800,
    MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
    get(keys, cb) {
      if (typeof keys === 'function') [keys, cb] = [null, keys];
      return done(call(local.get, prefixed(keys)).then(strip), cb);
    },
    set(items, cb) {
      return done(call(local.set, prefixed(items || {})), cb);
    },
    remove(keys, cb) {
      return done(call(local.remove, prefixed(keys)), cb);
    },
    clear(cb) {
      return done(call(local.get, null).then((all) => call(local.remove, Object.keys(all).filter((k) => k.startsWith(P)))), cb);
    },
    getBytesInUse(keys, cb) {
      if (typeof keys === 'function') [keys, cb] = [null, keys];
      return done(call(local.get, prefixed(keys)).then((r) => JSON.stringify(strip(r)).length), cb);
    },
    getKeys(cb) {
      return done(call(local.get, null).then((r) => Object.keys(strip(r))), cb);
    },
    setAccessLevel(opts, cb) {
      return done(Promise.resolve(), cb);
    },
    onChanged: {
      addListener: (fn) => syncListeners.add(fn),
      removeListener: (fn) => syncListeners.delete(fn),
      hasListener: (fn) => syncListeners.has(fn),
      hasListeners: () => syncListeners.size > 0,
    },
  };
  // chrome.storage.onChanged : les clés préfixées arrivent comme des changements de « sync ».
  const original = c.storage.onChanged;
  const wrapped = new Map();
  const split = (changes) => {
    const syncChanges = {};
    const localChanges = {};
    for (const [k, v] of Object.entries(changes)) {
      if (k.startsWith(P)) syncChanges[k.slice(P.length)] = v;
      else localChanges[k] = v;
    }
    return [syncChanges, localChanges];
  };
  if (original && original.addListener) {
    original.addListener((changes, area) => {
      if (area !== 'local') return;
      const [syncChanges] = split(changes);
      if (!Object.keys(syncChanges).length) return;
      for (const fn of syncListeners) {
        try {
          fn(syncChanges);
        } catch (e) {
          console.error(e);
        }
      }
    });
  }
  const onChanged = original && {
    addListener(fn) {
      if (wrapped.has(fn)) return;
      const w = (changes, area) => {
        if (area !== 'local') return fn(changes, area);
        const [syncChanges, localChanges] = split(changes);
        if (Object.keys(localChanges).length) fn(localChanges, 'local');
        if (Object.keys(syncChanges).length) fn(syncChanges, 'sync');
        return undefined;
      };
      wrapped.set(fn, w);
      original.addListener(w);
    },
    removeListener(fn) {
      const w = wrapped.get(fn);
      if (!w) return;
      wrapped.delete(fn);
      original.removeListener(w);
    },
    hasListener: (fn) => wrapped.has(fn),
    hasListeners: () => wrapped.size > 0,
  };
  const define = (obj, key, value) => {
    try {
      Object.defineProperty(obj, key, { value, configurable: true, enumerable: true, writable: true });
    } catch {}
  };
  define(c.storage, 'sync', sync);
  if (onChanged) define(c.storage, 'onChanged', onChanged);
  define(c.storage, '__devBrowsSync', true);
}


if (typeof process !== 'undefined' && (process.type === 'renderer' || process.type === 'service-worker')) {
  try {
    const { contextBridge } = require('electron');
    const isExtension = process.type === 'service-worker' || (typeof location !== 'undefined' && location.protocol === 'chrome-extension:');
    if (isExtension) {
      if (!process.contextIsolated) syncPolyfill();
      else contextBridge.executeInMainWorld({ func: syncPolyfill });
    }
  } catch (err) {
    console.error('dev-brows: chrome.storage.sync', err);
  }
}

if (typeof module === 'object' && module.exports) module.exports = { syncPolyfill };
