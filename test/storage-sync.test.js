'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { syncPolyfill } = require('../src/main/extensions/ext-sync-preload');

function fakeChrome() {
  const listeners = new Set();
  const data = {};
  const chrome = {
    runtime: {},
    storage: {
      local: {
        get: (keys, cb) => cb({ ...data }),
        set: (items, cb) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) changes[k] = { oldValue: data[k], newValue: (data[k] = v) };
          cb();
          for (const fn of listeners) fn(changes, 'local');
        },
        remove: (keys, cb) => cb(),
      },
      onChanged: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
    },
  };
  return { chrome, listeners };
}

test('storage.sync n\'écoute storage.onChanged que si l\'extension écoute storage.sync', async () => {
  const { chrome, listeners } = fakeChrome();
  globalThis.chrome = chrome;
  try {
    syncPolyfill();
    assert.strictEqual(listeners.size, 0);
    const seen = [];
    const fn = (changes) => seen.push(changes);
    chrome.storage.sync.onChanged.addListener(fn);
    assert.strictEqual(listeners.size, 1);
    await chrome.storage.sync.set({ a: 1 });
    await chrome.storage.local.set({ b: 2 }, () => {});
    assert.deepStrictEqual(seen, [{ a: { oldValue: undefined, newValue: 1 } }]);
    chrome.storage.sync.onChanged.removeListener(fn);
    assert.strictEqual(listeners.size, 0);
  } finally {
    delete globalThis.chrome;
  }
});

test('storage.managed est vide, même si storage.local ne l\'est pas', async () => {
  const { chrome } = fakeChrome();
  chrome.storage.managed = chrome.storage.local;
  globalThis.chrome = chrome;
  try {
    syncPolyfill();
    await new Promise((r) => chrome.storage.local.set({ cachedManagedStorage: { a: 1 } }, r));
    assert.deepStrictEqual(await chrome.storage.managed.get(), {});
    assert.deepStrictEqual(await new Promise((r) => chrome.storage.managed.get(null, r)), {});
  } finally {
    delete globalThis.chrome;
  }
});
