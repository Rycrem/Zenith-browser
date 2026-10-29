'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const state = require('../state');
const theme = require('../window/theme');

const RENDERER = path.join(__dirname, '..', '..', 'renderer');

// Le message vient d'une page de Zenith (src/renderer), pas d'un site ni d'un cadre glissé dedans.
function fromInternal(e) {
  const f = e.senderFrame;
  if (!f || f !== e.sender.mainFrame || !f.url.startsWith('file:')) return false;
  try {
    const rel = path.relative(RENDERER, fileURLToPath(f.url));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

// Les fenêtres de Zenith (interface, popups) ne quittent jamais leur page : un lien glissé dessus
// ou un window.open y chargerait un site qui garderait le pont vers Zenith (commandes, réglages).
function lockInternal(wc) {
  wc.on('will-frame-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
}

const background = (priv) => (theme.isLight() ? '#F6F7F9' : priv ? '#1A1024' : '#0E1116');

// Popup sans cadre, enfant de la fenêtre en cours, avec le pont panel-preload, aux couleurs de Zenith.
function popupWindow(file, options, priv = state.privateMode) {
  const w = new BrowserWindow({
    parent: state.win,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: background(priv),
    ...options,
    webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), sandbox: true, contextIsolation: true },
  });
  lockInternal(w.webContents);
  w.loadFile(path.join(RENDERER, 'panels', file), { query: { accent: theme.accentColor(), mode: theme.isLight() ? 'jour' : 'nuit', private: priv ? '1' : '' } });
  state.bindToCurrent(w);
  return w;
}

Object.assign(module.exports, { popupWindow, lockInternal, fromInternal, RENDERER });
