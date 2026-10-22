'use strict';

const { BrowserWindow } = require('electron');
const state = require('../state');
const tabList = require('../tabs/tabs');

let extPopupClosed = { n: 0, at: 0 };

function openExtPopup(n, x) {
  // Sans popup, l'extension réagit au clic elle-même (chrome.action.onClicked), comme dans Chrome.
  const ext = state.exts.get(n);
  if (ext.enabled && !ext.popup && ext.id) {
    const wc = tabList.activeTab()?.view?.webContents;
    const api = tabList.apiOf(tabList.activeTab());
    const details = wc && api.ctx.store.tabDetailsCache.get(wc.id);
    // L'accueil n'est pas un onglet connu des extensions : l'événement part alors sans onglet.
    api.ctx.router.sendEvent(ext.id, 'browserAction.onClicked', details || undefined);
    return;
  }
  const url = state.exts.popupUrl(n);
  // Un second clic (ou Alt+n) sur la même extension ferme sa popup.
  if (state.popupWin && !state.popupWin.isDestroyed()) {
    const same = state.popupWin.extN === n;
    state.popupWin.close();
    if (same) return;
  }
  // Le clic sur la pastille fait d'abord perdre le focus à la popup, qui se ferme : ce clic ne la rouvre pas.
  if (extPopupClosed.n === n && Date.now() - extPopupClosed.at < 300) return;
  const b = state.win.getContentBounds();
  const place = (w, h) => {
    const left = x !== undefined ? b.x + Math.round(x) - w + 60 : b.x + b.width - w - 16;
    return { x: Math.max(b.x, Math.min(left, b.x + b.width - w)), y: b.y + b.height - h - 36, width: w, height: h };
  };
  state.popupWin = new BrowserWindow({
    ...place(380, 480),
    parent: state.win,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: { session: tabList.sesOf(tabList.activeTab()), enablePreferredSizeMode: true },
  });
  const pw = state.popupWin;
  pw.extN = n;
  pw.on('closed', () => {
    extPopupClosed = { n, at: Date.now() };
  });
  pw.loadURL(url);
  pw.once('ready-to-show', () => pw.show());
  pw.on('blur', () => !pw.isDestroyed() && pw.close());
  pw.webContents.on('preferred-size-changed', (e, size) => {
    if (pw.isDestroyed()) return;
    const w = Math.min(Math.max(size.width, 200), 800);
    const h = Math.min(Math.max(size.height, 80), 600);
    pw.setBounds(place(w, h));
  });
  pw.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape') pw.close();
  });
  pw.webContents.setWindowOpenHandler(({ url: u }) => {
    tabList.createTab({ url: u });
    return { action: 'deny' };
  });
}

Object.assign(module.exports, { openExtPopup });
