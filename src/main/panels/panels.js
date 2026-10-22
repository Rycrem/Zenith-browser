'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fav = require('../../shared/favorites');
const state = require('../state');
const theme = require('../window/theme');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const extPopup = require('../extensions/popup');
const navigation = require('../tabs/navigation');
const output = require('../terminal/output');
const favs = require('../favorites/favorites');
const dl = require('../downloads/downloads');
const audio = require('../audio/audio');
const panelData = require('./panel-data');

let panelClosed = { kind: null, at: 0 };

function sendPanel(kind) {
  if (!state.panel || state.panel.kind !== kind || state.panel.win.isDestroyed()) return;
  state.panel.win.webContents.send('panel:data', panelData.PANELS[kind].data());
}

const sendDl = () => sendPanel('dl');

// Ouvre la popup au-dessus de son bouton de la barre du bas, ou la ferme.
// x : bord droit du bouton (téléchargements, à droite) ou bord gauche (favoris, à gauche).
function togglePanel(kind, x) {
  if (state.panel && !state.panel.win.isDestroyed()) {
    const same = state.panel.kind === kind;
    state.panel.win.close();
    if (same) return;
  }
  // Le clic sur le bouton fait d'abord perdre le focus à la popup, qui se ferme : ce clic ne la rouvre pas.
  if (panelClosed.kind === kind && Date.now() - panelClosed.at < 300) return;
  const { file, width } = panelData.PANELS[kind];
  const b = state.win.getContentBounds();
  const place = (height) => {
    let left;
    if (kind === 'fav') left = b.x + (x !== undefined ? Math.round(x) : 0);
    else left = x !== undefined ? b.x + Math.round(x) - width : b.x + b.width - width - 16;
    return { x: Math.max(b.x, Math.min(left, b.x + b.width - width)), y: b.y + b.height - height - 28, width, height };
  };
  const pw = new BrowserWindow({
    ...place(160),
    parent: state.win,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: theme.isLight() ? '#F6F7F9' : '#0E1116',
    webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), sandbox: true, contextIsolation: true },
  });
  state.panel = { kind, win: pw, place };
  pw.loadFile(path.join(__dirname, '../../renderer/panels', file), { query: { accent: theme.accentColor(), mode: theme.isLight() ? 'jour' : 'nuit', private: state.privateMode ? '1' : '' } });
  pw.webContents.once('did-finish-load', () => sendPanel(kind));
  pw.once('ready-to-show', () => pw.show());
  pw.on('blur', () => !pw.isDestroyed() && pw.close());
  pw.on('closed', () => {
    panelClosed = { kind, at: Date.now() };
    if (state.panel && state.panel.win === pw) state.panel = null;
  });
  pw.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape') pw.close();
  });
}

// Actions demandées par une popup : seulement celles de son type, sur ses propres données.
async function panelAction(kind, action, arg) {
  if (kind === 'dl') {
    if (action === 'dir') return void shell.openPath(app.getPath('downloads'));
    const d = Number.isInteger(arg) ? state.downloads[arg] : null;
    if (!d) return;
    if (action === 'folder') {
      if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
      dl.showInFolder(d.path);
    }
    else if (action === 'open' && d.state === 'completed') {
      const err = await shell.openPath(d.path);
      if (err) output.print([{ t: `  ${err}`, c: 'err' }]);
    }
  } else if (kind === 'audio') {
    const v = arg && Number(arg.volume);
    if (action === 'global' && Number.isFinite(v)) return audio.setGlobalVolume(v);
    if (action === 'muteAll') return audio.setMuteAll(!state.settings.data.muteAll);
    const tab = arg && tabList.getTab(arg.id);
    if (!tab || !tab.view) return;
    if (action === 'mute') audio.setMuted(tab, !audio.isMuted(tab));
    else if (action === 'toggle') await audio.togglePlay(tab);
    else if (action === 'volume' && Number.isFinite(v)) {
      tab.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
      audio.applyVolume(tab);
      audio.audioChanged();
    } else if (action === 'show') {
      tabList.selectTab(tab);
      if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
    }
  } else if (kind === 'ext') {
    const n = Number(arg && arg.n);
    if (!state.exts.summary()[n - 1]) return;
    if (action === 'pin') state.exts.pin(n);
    else if (action === 'toggle') await state.exts.setEnabled(n, !state.exts.get(n).enabled);
    else if (action === 'open') {
      if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
      return extPopup.openExtPopup(n);
    }
    ui.sendState();
    sendPanel('ext');
  } else if (kind === 'fav' && action === 'open' && arg && typeof arg.url === 'string') {
    // Seulement une adresse qui est bien dans les favoris.
    if (!fav.allLinks(state.favorites.data.tree).some((l) => l.url === arg.url)) return;
    if (state.panel && state.panel.kind === 'fav' && !state.panel.win.isDestroyed()) state.panel.win.close();
    if (arg.newTab) tabList.createTab({ url: arg.url, background: true });
    else navigation.navigate(tabList.activeTab(), arg.url);
  } else if (kind === 'fav' && action === 'move' && arg && typeof arg.src === 'string' && typeof arg.target === 'string' && ['before', 'after', 'into'].includes(arg.where)) {
    try {
      fav.reorderFavorite(state.favorites.data.tree, arg.src, arg.target, arg.where);
    } catch (err) {
      sendPanel('fav'); // remet l'arbre tel qu'il était
      return;
    }
    favs.saveFavorites();
  }
}

Object.assign(module.exports, { sendPanel, sendDl, togglePanel, panelAction });
