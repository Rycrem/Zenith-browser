'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { registerExtraApis } = require('./ext-api');
const state = require('../state');
const tabList = require('../tabs/tabs');
const pageView = require('../tabs/page-view');
const output = require('../terminal/output');
const dl = require('../downloads/downloads');
const search = require('../search/run-search');

// electron-chrome-extensions n'envoie jamais tabs.onHighlighted, et le sender des messages n'a
// tab.active vrai que si la page a le focus clavier. Dashlane attend l'un ou l'autre pour
// analyser les champs : on signale l'onglet affiché quand il est choisi, chargé ou cliqué.
function highlightForExtensions(tab) {
  const wc = tab && tab.view && tab.view.webContents;
  if (!wc || wc.isDestroyed() || tabList.paneOf(tab) < 0 || !state.win) return;
  try {
    tabList.apiOf(tab).ctx.router.broadcastEvent('tabs.onHighlighted', { tabIds: [wc.id], windowId: state.win.id });
  } catch {}
}

// chrome.tabs / chrome.windows des extensions, branchés sur les onglets de dev-brows.
function setupChromeApi(s) {
  // Avant le préchargement de la bibliothèque, qui fige l'objet chrome une fois ses API posées,
  // puis après lui, pour remplacer ses chrome.downloads qui ne font rien.
  const apiPreload = (when) => {
    for (const type of ['frame', 'service-worker']) s.registerPreloadScript({ id: `dev-brows-api-${when}-${type}`, type, filePath: path.join(__dirname, 'ext-api-preload.js') });
  };
  apiPreload('early');
  s.registerPreloadScript({ id: 'dev-brows-webstore', type: 'frame', filePath: path.join(__dirname, 'store-preload.js') });
  const api = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: s,
    createTab(details) {
      const tab = tabList.createTab({ url: details.url || undefined, background: details.active === false });
      return [pageView.ensureView(tab).webContents, state.win];
    },
    selectTab(wc) {
      if (state.addingTab) return;
      const tab = pageView.tabOfContents(wc);
      if (tab) state.inWindow(state.windowOfTab(tab), () => tabList.selectTab(tab));
    },
    removeTab(wc) {
      const tab = pageView.tabOfContents(wc);
      if (tab) state.inWindow(state.windowOfTab(tab), () => tabList.closeTab(tab));
    },
    // Les extensions ouvrent parfois une petite fenêtre (connexion, déverrouillage…).
    createWindow(details) {
      const popup = new BrowserWindow({
        width: details.width || 480,
        height: details.height || 640,
        parent: details.type === 'popup' ? state.win : undefined,
        title: 'Zenith',
        webPreferences: { session: s, sandbox: true, contextIsolation: true },
      });
      popup.setMenuBarVisibility(false);
      const url = [].concat(details.url || [])[0];
      if (url) popup.loadURL(url);
      return popup;
    },
    removeWindow(w) {
      if (!w.isDestroyed()) w.close();
    },
  });
  apiPreload('late');
  registerExtraApis(api, {
    window: () => state.win,
    activeContents: () => tabList.activeTab()?.view?.webContents,
    search(text, here) {
      const tab = (here && tabList.activeTab()) || tabList.createTab({});
      search.runSearch(tab, text).then((lines) => output.print(lines)).catch(() => {});
    },
    history: () => state.history.data.entries,
    favorites: () => state.favorites.data.tree,
    downloads: () => state.downloads,
    download: (url) => s.downloadURL(url),
    showItem: (p) => dl.showInFolder(p),
    openItem: (p) => shell.openPath(p),
    showDownloadsFolder: () => shell.openPath(app.getPath('downloads')),
    openSidePanel(url, title) {
      const b = state.win.getBounds();
      const side = new BrowserWindow({
        x: b.x + b.width - 400,
        y: b.y,
        width: 400,
        height: b.height,
        parent: state.win,
        title,
        webPreferences: { session: s, sandbox: true, contextIsolation: true },
      });
      side.setMenuBarVisibility(false);
      side.loadURL(url);
    },
  });
  return api;
}

Object.assign(module.exports, { highlightForExtensions, setupChromeApi });
