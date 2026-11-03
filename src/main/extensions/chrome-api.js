'use strict';

const { app, BrowserWindow, shell, nativeImage } = require('electron');
const path = require('path');
const { t } = require('../../shared/i18n');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { registerExtraApis } = require('./ext-api');
const state = require('../state');
const tabList = require('../tabs/tabs');
const pageView = require('../tabs/page-view');
const output = require('../terminal/output');
const dl = require('../downloads/downloads');
const search = require('../search/run-search');
const modal = require('../panels/modal');

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
    async openItem(p, name) {
      const yes = await modal.confirmModal({
        title: t('Ouvrir un téléchargement'),
        message: t('L\'extension {name} veut ouvrir « {file} ». Un fichier peut lancer un programme : ne l\'ouvre que si tu sais d\'où il vient.', { name, file: path.basename(p) }),
        ok: t('Ouvrir'),
        cancel: t('Annuler'),
      });
      if (yes) await shell.openPath(p);
    },
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
  // Logo, pastille et texte d'une extension changent (chrome.action.setIcon, setBadgeText…) :
  // la barre d'état suit, comme la barre d'outils de Chrome.
  const ba = api.api && api.api.browserAction;
  if (ba && typeof ba.onUpdate === 'function') {
    const onUpdate = ba.onUpdate.bind(ba);
    ba.onUpdate = () => {
      onUpdate();
      require('../window/ui').sendStateAll();
    };
  }
  return api;
}

// État du bouton d'une extension pour l'onglet affiché : logo du moment (data:), texte et
// couleur de sa pastille. null si l'extension n'a pas de bouton connu.
const iconCache = new Map(); // clé : extension, onglet, date du changement → data:
const pick = (set) => {
  if (!set || typeof set !== 'object') return set;
  const sizes = Object.keys(set).map(Number).sort((a, b) => a - b);
  return set[sizes.find((n) => n >= 32) || sizes[sizes.length - 1]];
};
const cssColor = (c) => (Array.isArray(c) ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] ?? 255) / 255})` : typeof c === 'string' ? c : null);

function actionState(tab, extId, extPath) {
  const api = tab && tabList.apiOf(tab);
  const ba = api && api.api && api.api.browserAction;
  const action = ba && ba.actionMap && ba.actionMap.get(extId);
  if (!action) return null;
  const wc = tab.view && tab.view.webContents;
  const per = (wc && !wc.isDestroyed() && action.tabs[wc.id]) || {};
  const val = (k) => (per[k] !== undefined ? per[k] : action[k]);
  const icon = val('icon');
  let src = null;
  if (icon) {
    const key = `${extId}:${per.icon ? wc.id : ''}:${val('iconModified') || 0}`;
    if (iconCache.has(key)) src = iconCache.get(key);
    else {
      try {
        const data = typeof icon.imageData === 'string' ? icon.imageData : pick(icon.imageData);
        const file = !data && pick(icon.path);
        const img = data ? nativeImage.createFromDataURL(data) : file && extPath ? nativeImage.createFromPath(path.join(extPath, String(file).replace(/^\/+/, ''))) : null;
        src = img && !img.isEmpty() ? img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL() : null;
      } catch {
        src = null;
      }
      if (iconCache.size > 300) iconCache.clear();
      iconCache.set(key, src);
    }
  }
  const text = val('text');
  return { icon: src, badge: text ? String(text).slice(0, 4) : '', badgeColor: cssColor(val('color')) };
}

Object.assign(module.exports, { highlightForExtensions, setupChromeApi, actionState });
