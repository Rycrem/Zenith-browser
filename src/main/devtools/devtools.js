'use strict';

const { BrowserWindow, WebContentsView } = require('electron');
const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');

function openDevtools(tab, x, y) {
  if (!tab.view) throw new Error(t('aucune page ouverte'));
  const wc = tab.view.webContents;
  if (!tab.dev) {
    // Les DevTools s'affichent dans une vue à droite de la page, comme dans Chrome.
    tab.dev = new WebContentsView();
    state.win.contentView.addChildView(tab.dev);
    wc.setDevToolsWebContents(tab.dev.webContents);
    // Avec une vue DevTools à nous, isDevToolsOpened() reste faux : on suit l'état nous-mêmes.
    wc.on('devtools-closed', () => {
      tab.devOpen = false;
      tab.devStarted = false;
      ui.layout();
    });
  }
  if (tab.screen) tab.screen = null;
  if (!tab.devStarted) wc.openDevTools({ mode: 'detach', activate: false });
  tab.devStarted = true;
  tab.devOpen = true;
  if (x !== undefined) wc.inspectElement(x, y);
  ui.layout();
  ui.sendState();
}

function closeDevtools(tab) {
  if (tab.devWin) attachDevtools(tab);
  tab.devOpen = false;
  ui.layout();
  ui.sendState();
}

// Détache la vue DevTools dans sa propre fenêtre : on déplace la vue, la connexion à la page reste.
function detachDevtools(tab) {
  if (!tab.dev || !tab.devOpen || tab.devWin) return;
  const b = state.win.getBounds();
  const dw = new BrowserWindow({ width: Math.round(b.width * 0.45), height: b.height, x: b.x + b.width - Math.round(b.width * 0.45), y: b.y, title: `DevTools · ${tabList.tabTitle(tab)}`, autoHideMenuBar: true });
  state.win.contentView.removeChildView(tab.dev);
  dw.contentView.addChildView(tab.dev);
  tab.dev.setVisible(true);
  const fit = () => {
    const [w, h] = dw.getContentSize();
    tab.dev.setBounds({ x: 0, y: 0, width: w, height: h });
  };
  fit();
  dw.on('resize', fit);
  // Fermer la fenêtre ferme les DevTools : la vue revient dans la fenêtre principale, cachée.
  dw.on('close', () => {
    if (tab.devWin !== dw) return;
    attachDevtools(tab);
    tab.devOpen = false;
    ui.layout();
    ui.sendState();
  });
  tab.devWin = dw;
  ui.layout();
  ui.sendState();
}

function attachDevtools(tab) {
  const dw = tab.devWin;
  if (!dw) return;
  tab.devWin = null;
  if (!dw.isDestroyed()) {
    dw.contentView.removeChildView(tab.dev);
    dw.destroy();
  }
  state.win.contentView.addChildView(tab.dev);
  ui.layout();
  ui.sendState();
}

function toggleDevtools(tab) {
  if (tab.devOpen) {
    // On cache la vue sans fermer les DevTools : une fois fermées, Electron les rouvre vides
    // dans une vue à nous.
    closeDevtools(tab);
    return false;
  }
  openDevtools(tab);
  return true;
}

Object.assign(module.exports, { openDevtools, closeDevtools, detachDevtools, attachDevtools, toggleDevtools });
