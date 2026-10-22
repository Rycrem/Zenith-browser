'use strict';

// Chromium définit maintenant `browser` à côté de `chrome` dans les pages d'extension.
// electron-chrome-extensions complète seulement `chrome` (browserAction, contextMenus,
// webNavigation…) : une extension qui préfère `browser`, comme uBlock Origin, ne voit
// pas ces API et plante au démarrage. On fait pointer `browser` sur `chrome`.
const { contextBridge, webFrame } = require('electron');

function alias() {
  if (location.protocol !== 'chrome-extension:' || typeof globalThis.chrome !== 'object') return;
  Object.defineProperty(globalThis, 'browser', { value: globalThis.chrome, writable: true, configurable: true });
}

if (!process.contextIsolated) alias();
else if ('executeInMainWorld' in contextBridge) contextBridge.executeInMainWorld({ func: alias });
else webFrame.executeJavaScript(`(${alias})()`);
