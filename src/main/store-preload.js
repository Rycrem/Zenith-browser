'use strict';

// Chrome Web Store : le site n'active « Ajouter à Chrome » que s'il trouve chrome.webstorePrivate,
// l'API que Chrome (et Brave) lui réservent. On la lui donne sur ce site seulement ; main.js
// vérifie l'origine de chaque appel, demande confirmation et installe avec « ext add ».
const { contextBridge, ipcRenderer } = require('electron');

function install(store) {
  const chrome = (globalThis.chrome = globalThis.chrome || {});
  // Réponse par promesse ou par fonction de rappel, comme dans Chrome.
  const api = (fn) => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const p = fn(...args).then((r) => {
      if (r && r.error !== undefined) {
        chrome.extension = chrome.extension || {};
        chrome.extension.lastError = r.error ? { message: r.error } : null;
        return r.result;
      }
      return r;
    });
    if (cb) p.then(cb, () => cb());
    return p;
  };
  const call = (name) => api((...args) => store.call(name, ...args));
  const enums = store.enums;
  chrome.webstorePrivate = {
    ...enums,
    beginInstallWithManifest3: api((details) => store.call('beginInstall', details, navigator.userActivation ? navigator.userActivation.isActive : true)),
    completeInstall: call('completeInstall'),
    install: call('completeInstall'),
    getExtensionStatus: call('getExtensionStatus'),
    getFullChromeVersion: call('getFullChromeVersion'),
    getMV2DeprecationStatus: api(async () => enums.MV2DeprecationStatus.INACTIVE),
    getWebGLStatus: api(async () => enums.WebGlStatus.WEBGL_ALLOWED),
    getReferrerChain: api(async () => 'EgIIAA=='),
    getBrowserLogin: api(async () => ({ login: '' })),
    getStoreLogin: api(async () => ''),
    setStoreLogin: api(async () => undefined),
    getIsLauncherEnabled: api(async () => false),
    enableAppLauncher: api(async () => undefined),
    isInIncognitoMode: api(async () => false),
    isPendingCustodianApproval: api(async () => false),
  };
  const listeners = { onInstalled: new Set(), onUninstalled: new Set(), onEnabled: new Set(), onDisabled: new Set() };
  const event = (set) => ({ addListener: (cb) => set.add(cb), removeListener: (cb) => set.delete(cb), hasListener: (cb) => set.has(cb) });
  store.onEvent((name, arg) => {
    for (const cb of listeners[name] || []) {
      try {
        cb(arg);
      } catch (err) {
        console.error(err);
      }
    }
  });
  chrome.management = Object.assign(chrome.management || {}, {
    getAll: call('getAll'),
    get: call('get'),
    setEnabled: call('setEnabled'),
    uninstall: api((id) => store.call('uninstall', id, navigator.userActivation ? navigator.userActivation.isActive : true)),
    onInstalled: event(listeners.onInstalled),
    onUninstalled: event(listeners.onUninstalled),
    onEnabled: event(listeners.onEnabled),
    onDisabled: event(listeners.onDisabled),
  });
}

const ENUMS = {
  Result: {
    ALREADY_INSTALLED: 'already_installed',
    BLACKLISTED: 'blacklisted',
    BLOCKED_BY_POLICY: 'blocked_by_policy',
    FEATURE_DISABLED: 'feature_disabled',
    INSTALL_ERROR: 'install_error',
    INSTALL_IN_PROGRESS: 'install_in_progress',
    INVALID_ID: 'invalid_id',
    MANIFEST_ERROR: 'manifest_error',
    SUCCESS: 'success',
    UNKNOWN_ERROR: 'unknown_error',
    UNSUPPORTED_EXTENSION_TYPE: 'unsupported_extension_type',
    USER_CANCELLED: 'user_cancelled',
    USER_GESTURE_REQUIRED: 'user_gesture_required',
  },
  ExtensionInstallStatus: {
    BLACKLISTED: 'blacklisted',
    BLOCKED_BY_POLICY: 'blocked_by_policy',
    CAN_REQUEST: 'can_request',
    CORRUPTED: 'corrupted',
    DEPRECATED_MANIFEST_VERSION: 'deprecated_manifest_version',
    DISABLED: 'disabled',
    ENABLED: 'enabled',
    FORCE_INSTALLED: 'force_installed',
    INSTALLABLE: 'installable',
    REQUEST_PENDING: 'request_pending',
    TERMINATED: 'terminated',
  },
  MV2DeprecationStatus: { INACTIVE: 'inactive', SOFT_DISABLE: 'soft_disable', WARNING: 'warning' },
  WebGlStatus: { WEBGL_ALLOWED: 'webgl_allowed', WEBGL_BLOCKED: 'webgl_blocked' },
};

if (typeof location !== 'undefined' && location.origin === 'https://chromewebstore.google.com' && process.contextIsolated) {
  try {
    const store = {
      enums: ENUMS,
      call: (name, ...args) => ipcRenderer.invoke('store:call', name, ...args),
      onEvent: (cb) => ipcRenderer.on('store:event', (e, name, arg) => cb(name, arg)),
    };
    contextBridge.executeInMainWorld({ func: install, args: [store] });
  } catch (err) {
    console.error('dev-brows: webstorePrivate', err);
  }
}
