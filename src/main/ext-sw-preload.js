'use strict';

// Service workers des extensions : electron-chrome-extensions ne relie pas
// chrome.tabs.onHighlighted (l'événement natif d'Electron ne se déclenche jamais).
// Dashlane attend cet événement pour savoir que l'onglet est affiché et analyser
// ses champs. On branche l'événement sur le routeur de la bibliothèque, comme
// elle le fait pour tabs.onActivated : main.js l'envoie avec broadcastEvent.
const { contextBridge, ipcRenderer } = require('electron');

const EVENT = 'tabs.onHighlighted';

function setup() {
  if (process.type !== 'service-worker') return;
  // `location` n'existe pas dans le contexte isolé du préchargement : on demande l'identifiant au worker.
  const extensionId = contextBridge.executeInMainWorld({ func: () => (globalThis.chrome && chrome.runtime && chrome.runtime.id) || '' });
  if (!extensionId) return;
  const callbacks = new Set();
  ipcRenderer.on(`crx-${EVENT}`, (e, ...args) => {
    for (const cb of callbacks) {
      try {
        cb(...args);
      } catch (err) {
        console.error(err);
      }
    }
  });
  const add = (cb) => {
    if (!callbacks.size) ipcRenderer.send('crx-add-listener', extensionId, EVENT);
    callbacks.add(cb);
  };
  const remove = (cb) => {
    callbacks.delete(cb);
    if (!callbacks.size) ipcRenderer.send('crx-remove-listener', extensionId, EVENT);
  };
  contextBridge.executeInMainWorld({
    func: (add, remove) => {
      const tabs = globalThis.chrome && globalThis.chrome.tabs;
      if (!tabs) return;
      const own = new Set();
      const event = {
        addListener: (cb) => { own.add(cb); add(cb); },
        removeListener: (cb) => { own.delete(cb); remove(cb); },
        hasListener: (cb) => own.has(cb),
        hasListeners: () => own.size > 0,
      };
      try {
        Object.defineProperty(tabs, 'onHighlighted', { value: event, configurable: true, enumerable: true });
      } catch {}
    },
    args: [add, remove],
  });
}

try {
  setup();
} catch (err) {
  console.error('dev-brows: tabs.onHighlighted', err);
}
