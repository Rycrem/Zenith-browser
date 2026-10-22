'use strict';

// API Chrome qu'Electron et electron-chrome-extensions ne fournissent pas : sans elles, une
// extension qui les appelle au démarrage plante (« Cannot read properties of undefined »).
// On les ajoute dans les pages et le service worker des extensions qui déclarent la permission.
// Les appels partent vers main.js par le routeur de la bibliothèque (ext-api.js les traite) ;
// celles qui n'ont pas d'équivalent dans dev-brows répondent vide, sans erreur.
const { contextBridge, ipcRenderer } = require('electron');

// Exécutée dans le monde de l'extension : invoke(nom, ...args) appelle main.js,
// listen(nom, relais) branche un événement envoyé par main.js (relais null : le débranche).
function installApis(invoke, listen) {
  const chrome = globalThis.chrome;
  if (!chrome || !chrome.runtime || !chrome.runtime.getManifest) return;
  const manifest = chrome.runtime.getManifest() || {};
  const perms = new Set([...(manifest.permissions || []), ...(manifest.optional_permissions || [])]);
  const has = (p) => perms.has(p);

  // Accepte les deux formes de Chrome : promesse, ou fonction de rappel en dernier argument.
  const wrap = (fn) => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const p = Promise.resolve().then(() => fn(...args));
    if (!cb) return p;
    p.then((r) => cb(r), (err) => {
      console.warn(String((err && err.message) || err));
      cb();
    });
  };
  const call = (name) => wrap((...args) => invoke(name, ...args));
  const value = (v) => wrap(() => (typeof v === 'function' ? v() : v));
  const refuse = (what) => wrap(() => {
    throw new Error(`Zenith : ${what} n'est pas pris en charge`);
  });
  // Un seul relais par événement vers le monde isolé (les fonctions qui traversent le pont
  // changent d'identité) : il appelle les fonctions inscrites ici.
  const event = (name) => {
    const own = new Set();
    const relay = (...args) => {
      for (const cb of own) {
        try {
          cb(...args);
        } catch (err) {
          console.error(err);
        }
      }
    };
    return {
      addListener: (cb) => {
        if (typeof cb !== 'function' || own.has(cb)) return;
        own.add(cb);
        if (own.size === 1) listen(name, relay);
      },
      removeListener: (cb) => {
        if (own.delete(cb) && !own.size) listen(name, null);
      },
      hasListener: (cb) => own.has(cb),
      hasListeners: () => own.size > 0,
    };
  };
  const events = (ns, names) => Object.fromEntries(names.map((n) => [n, event(`${ns}.${n}`)]));
  // N'ajoute que ce qui manque : une API déjà fournie n'est pas remplacée, sauf si `force`
  // (les chrome.downloads d'electron-chrome-extensions ne font rien). Ce script passe avant
  // et après celui de la bibliothèque : le second passage ne touche qu'à ce qui est forcé.
  const define = (name, api, force = false) => {
    const cur = chrome[name];
    if (!cur) {
      try {
        Object.defineProperty(chrome, name, { value: api, configurable: true, enumerable: true, writable: true });
      } catch {}
      return;
    }
    for (const [k, v] of Object.entries(api)) {
      if (cur[k] !== undefined && !(force && typeof v === 'function')) continue;
      try {
        cur[k] = v;
      } catch {}
      if (cur[k] === undefined) {
        try {
          Object.defineProperty(cur, k, { value: v, configurable: true, enumerable: true, writable: true });
        } catch {}
      }
    }
  };

  // Capture de l'onglet affiché (permission activeTab ou <all_urls>, comme dans Chrome).
  define('tabs', {
    captureVisibleTab: call('devbrows.tabs.captureVisibleTab'),
    group: refuse('les groupes d\'onglets'),
    ungroup: refuse('les groupes d\'onglets'),
  });

  if (has('search')) define('search', { query: call('devbrows.search.query') });

  // getSelf ne demande pas de permission ; la liste des autres extensions, si.
  define('management', {
    getSelf: call('devbrows.management.getSelf'),
    ...(has('management') ? { getAll: call('devbrows.management.getAll'), get: call('devbrows.management.get') } : {}),
    ...events('management', ['onInstalled', 'onUninstalled', 'onEnabled', 'onDisabled']),
  });

  if (has('history')) {
    define('history', {
      search: call('devbrows.history.search'),
      getVisits: call('devbrows.history.getVisits'),
      addUrl: value(undefined),
      deleteUrl: value(undefined),
      deleteRange: value(undefined),
      deleteAll: value(undefined),
      ...events('history', ['onVisited', 'onVisitRemoved']),
    });
  }

  if (has('bookmarks')) {
    const readOnly = refuse('la modification des favoris par une extension');
    define('bookmarks', {
      getTree: call('devbrows.bookmarks.getTree'),
      getChildren: call('devbrows.bookmarks.getChildren'),
      get: call('devbrows.bookmarks.get'),
      getSubTree: call('devbrows.bookmarks.getSubTree'),
      getRecent: call('devbrows.bookmarks.getRecent'),
      search: call('devbrows.bookmarks.search'),
      create: readOnly,
      update: readOnly,
      move: readOnly,
      remove: readOnly,
      removeTree: readOnly,
      ...events('bookmarks', ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportBegan', 'onImportEnded']),
    });
  }

  if (has('identity')) {
    define('identity', {
      getRedirectURL: (p = '') => `https://${chrome.runtime.id}.chromiumapp.org/${String(p).replace(/^\//, '')}`,
      launchWebAuthFlow: call('devbrows.identity.launchWebAuthFlow'),
      getAuthToken: refuse('la connexion avec un compte Google du navigateur'),
      getAccounts: value([]),
      getProfileUserInfo: value({ email: '', id: '' }),
      removeCachedAuthToken: value(undefined),
      clearAllCachedAuthTokens: value(undefined),
      ...events('identity', ['onSignInChanged']),
    });
  }

  if (has('sidePanel')) {
    define('sidePanel', {
      open: call('devbrows.sidePanel.open'),
      setOptions: value(undefined),
      getOptions: value(() => ({ enabled: true, path: (manifest.side_panel || {}).default_path })),
      setPanelBehavior: value(undefined),
      getPanelBehavior: value({ openPanelOnActionClick: false }),
      getLayout: value({ side: 'right' }),
    });
  }

  if (has('tabGroups')) {
    define('tabGroups', {
      TAB_GROUP_ID_NONE: -1,
      Color: { GREY: 'grey', BLUE: 'blue', RED: 'red', YELLOW: 'yellow', GREEN: 'green', PINK: 'pink', PURPLE: 'purple', CYAN: 'cyan', ORANGE: 'orange' },
      query: value([]),
      get: refuse('les groupes d\'onglets'),
      update: refuse('les groupes d\'onglets'),
      move: refuse('les groupes d\'onglets'),
      ...events('tabGroups', ['onCreated', 'onUpdated', 'onMoved', 'onRemoved']),
    });
  }

  if (has('sessions')) {
    define('sessions', {
      MAX_SESSION_RESULTS: 25,
      getRecentlyClosed: value([]),
      getDevices: value([]),
      restore: refuse('la restauration de session'),
      ...events('sessions', ['onChanged']),
    });
  }

  if (has('fontSettings')) {
    const level = { levelOfControl: 'not_controllable' };
    define('fontSettings', {
      getFontList: value([]),
      getFont: value({ fontId: '', ...level }),
      setFont: value(undefined),
      clearFont: value(undefined),
      getDefaultFontSize: value({ pixelSize: 16, ...level }),
      setDefaultFontSize: value(undefined),
      clearDefaultFontSize: value(undefined),
      getDefaultFixedFontSize: value({ pixelSize: 13, ...level }),
      setDefaultFixedFontSize: value(undefined),
      clearDefaultFixedFontSize: value(undefined),
      getMinimumFontSize: value({ pixelSize: 0, ...level }),
      setMinimumFontSize: value(undefined),
      clearMinimumFontSize: value(undefined),
      ...events('fontSettings', ['onFontChanged', 'onDefaultFontSizeChanged', 'onDefaultFixedFontSizeChanged', 'onMinimumFontSizeChanged']),
    });
  }

  // Synthèse vocale : celle du navigateur dans les pages ; le service worker n'en a pas.
  if (has('tts')) {
    const synth = globalThis.speechSynthesis;
    define('tts', {
      speak: wrap((text, opts = {}) => {
        if (!synth || typeof SpeechSynthesisUtterance !== 'function') return;
        if (!opts.enqueue) synth.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        if (opts.lang) u.lang = opts.lang;
        if (opts.rate) u.rate = opts.rate;
        if (opts.pitch) u.pitch = opts.pitch;
        if (opts.volume !== undefined) u.volume = opts.volume;
        if (typeof opts.onEvent === 'function') {
          u.onend = () => opts.onEvent({ type: 'end' });
          u.onerror = () => opts.onEvent({ type: 'error' });
        }
        synth.speak(u);
      }),
      stop: () => synth && synth.cancel(),
      pause: () => synth && synth.pause(),
      resume: () => synth && synth.resume(),
      isSpeaking: value(() => !!(synth && synth.speaking)),
      getVoices: value(() => (synth ? synth.getVoices().map((v) => ({ voiceName: v.name, lang: v.lang, remote: !v.localService })) : [])),
      ...events('tts', ['onVoicesChanged']),
    });
  }

  if (has('downloads')) {
    define('downloads', {
      download: call('devbrows.downloads.download'),
      search: call('devbrows.downloads.search'),
      show: call('devbrows.downloads.show'),
      showDefaultFolder: call('devbrows.downloads.showDefaultFolder'),
      open: call('devbrows.downloads.open'),
      erase: value([]),
      pause: value(undefined),
      resume: value(undefined),
      cancel: value(undefined),
      getFileIcon: value(undefined),
      setShelfEnabled: () => {},
      setUiOptions: value(undefined),
      ...events('downloads', ['onCreated', 'onChanged', 'onErased', 'onDeterminingFilename']),
    }, true);
  }
}

function setup() {
  const worker = process.type === 'service-worker';
  if (!worker && (typeof location === 'undefined' || location.protocol !== 'chrome-extension:')) return;
  // `location` n'existe pas dans le contexte isolé d'un service worker : on demande l'identifiant au worker.
  const extensionId = contextBridge.executeInMainWorld({ func: () => (globalThis.chrome && chrome.runtime && chrome.runtime.id) || '' });
  if (!extensionId) return;
  const invoke = (name, ...args) => ipcRenderer.invoke('crx-msg', extensionId, name, ...args);
  const relays = new Map(); // nom de l'événement → relais du monde de l'extension
  const listen = (name, relay) => {
    if (relay) {
      if (!relays.has(name)) {
        ipcRenderer.on(`crx-${name}`, (e, ...args) => {
          const fn = relays.get(name);
          if (fn) fn(...args);
        });
      }
      relays.set(name, relay);
      ipcRenderer.send('crx-add-listener', extensionId, name);
    } else if (relays.get(name)) {
      relays.set(name, null);
      ipcRenderer.send('crx-remove-listener', extensionId, name);
    }
  };
  contextBridge.executeInMainWorld({ func: installApis, args: [invoke, listen] });
}

try {
  setup();
} catch (err) {
  console.error('dev-brows: API d\'extensions', err);
}
