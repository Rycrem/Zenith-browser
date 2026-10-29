'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');
const { popupWindow } = require('../panels/popup-window');
const tabList = require('../tabs/tabs');
const output = require('../terminal/output');

// Ctrl+F : une petite fenêtre en haut à droite de l'écran actif (la page, vue native, couvrirait l'interface).
// Sur un écran du terminal (historique, favoris, aide…), c'est l'interface qui cherche et surligne.
function findBounds() {
  const r = state.rects[state.activePane];
  if (!r) return null;
  const b = state.win.getContentBounds();
  const width = Math.min(360, Math.max(200, r.width - 32));
  return { x: b.x + r.x + r.width - width - 16, y: b.y + r.y + 8, width, height: 38 };
}

function openFind() {
  const tab = tabList.activeTab();
  const screen = !tab.view || !!tab.screen;
  const bounds = findBounds();
  if (!bounds) return undefined;
  if (state.findWin && !state.findWin.win.isDestroyed()) {
    if (state.findWin.tabId !== tab.id || state.findWin.screen !== screen) closeFind(false);
    else {
      state.findWin.win.setBounds(bounds);
      state.findWin.win.focus();
      state.findWin.win.webContents.send('panel:data', { text: tab.findText || '' });
      return undefined;
    }
  }
  const fw = popupWindow('find.html', bounds, tab.private);
  state.findWin = { win: fw, tabId: tab.id, screen };
  fw.webContents.once('did-finish-load', () => fw.webContents.send('panel:data', {
    text: tab.findText || '',
    labels: { placeholder: screen ? t('chercher dans l\'écran') : t('chercher dans la page'), next: t('Résultat suivant (Entrée)'), prev: t('Résultat précédent (Maj+Entrée)'), close: t('Fermer (Échap)') },
  }));
  fw.once('ready-to-show', () => fw.show());
  fw.on('closed', () => {
    if (state.findWin && state.findWin.win === fw) state.findWin = null;
  });
  return undefined;
}

function closeFind(focusPage = true) {
  if (!state.findWin) return;
  const { win: fw, tabId, screen } = state.findWin;
  state.findWin = null;
  if (!fw.isDestroyed()) fw.close();
  const tab = tabList.getTab(tabId);
  if (tab) tab.findText = '';
  if (screen) {
    if (state.win && !state.win.isDestroyed()) state.win.webContents.send('ui:find', { text: '' });
    if (focusPage) output.focusTerminal();
    return;
  }
  const wc = tab && tab.view && tab.view.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.stopFindInPage('clearSelection');
  tab.findText = '';
  if (focusPage && tabList.paneOf(tab) >= 0) {
    state.lastCommandAt = 0;
    wc.focus();
  }
}

function findAction(action, arg) {
  const tab = tabList.getTab(state.findWin.tabId);
  if (action === 'close' || !tab || (!state.findWin.screen && !tab.view)) return closeFind();
  if (action !== 'find' || !arg || typeof arg.text !== 'string' || !arg.text) return undefined;
  if (state.findWin.screen) {
    state.win.webContents.send('ui:find', { pane: tabList.paneOf(tab), text: arg.text, forward: arg.forward !== false });
    return undefined;
  }
  // Pour Electron, findNext: true ouvre une nouvelle recherche ; false passe au résultat suivant.
  tab.view.webContents.findInPage(arg.text, { findNext: tab.findText !== arg.text, forward: arg.forward !== false });
  tab.findText = arg.text;
  return undefined;
}

Object.assign(module.exports, { findBounds, openFind, closeFind, findAction });
