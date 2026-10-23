'use strict';

const os = require('os');
const fav = require('../../shared/favorites');
const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const theme = require('./theme');
const tabList = require('../tabs/tabs');
const findInPage = require('../search/find-in-page');
const audio = require('../audio/audio');
const mobile = require('../page/mobile');

const tr = t; // là où une variable locale « t » (un onglet) cache t()

const DEVTOOLS_RATIO = 0.4;
const DEVBAR_H = 26; // barre de l'interface au-dessus des DevTools (détacher, fermer)

function setHtmlFullscreen(tab, on) {
  if (!state.win || state.win.isDestroyed()) return;
  if (on) {
    state.fullTab = tab;
    if (!state.win.isFullScreen()) { state.fullSetWin = true; state.win.setFullScreen(true); }
  } else if (state.fullTab === tab) {
    state.fullTab = null;
    if (state.fullSetWin) { state.fullSetWin = false; state.win.setFullScreen(false); }
  }
  layout();
}

function layout() {
  if (!state.win) return;
  if (state.findWin && !state.findWin.win.isDestroyed()) {
    const tab = tabList.getTab(state.findWin.tabId);
    const b = findInPage.findBounds();
    if (!tab || tabList.paneOf(tab) !== state.activePane || !!tab.screen !== state.findWin.screen || !b) findInPage.closeFind(false);
    else state.findWin.win.setBounds(b);
  }
  if (state.fullTab && (!state.tabs.includes(state.fullTab) || !state.fullTab.view || tabList.paneOf(state.fullTab) < 0)) setHtmlFullscreen(state.fullTab, false);
  if (state.fullTab) {
    const [width, height] = state.win.getContentSize();
    state.tabs.forEach((tab) => {
      if (tab.view) tab.view.setVisible(tab === state.fullTab);
      if (tab.dev && !tab.devWin) tab.dev.setVisible(false);
    });
    state.fullTab.view.setBounds({ x: 0, y: 0, width, height });
    return;
  }
  state.tabs.forEach((tab) => {
    const p = tabList.paneOf(tab);
    const r = state.rects[p];
    const visible = p >= 0 && r && !tab.screen && !tab.blank && !state.dragging && r.width > 0 && r.height > 0;
    const devOpen = visible && tab.dev && tab.devOpen && !tab.devWin;
    if (tab.view) tab.view.setVisible(!!visible);
    if (tab.dev && !tab.devWin) tab.dev.setVisible(!!devOpen);
    if (!visible) return;
    const devW = devOpen ? Math.round(r.width * DEVTOOLS_RATIO) : 0;
    if (devOpen) tab.dev.setBounds({ x: r.x + r.width - devW, y: r.y + DEVBAR_H, width: devW, height: Math.max(0, r.height - DEVBAR_H) });
    const page = { x: r.x, y: r.y, width: r.width - devW, height: r.height };
    // Mode mobile : la page à la taille de l'appareil, au milieu de son écran.
    if (state.mobile) {
      const m = mobile.fit(page);
      tab.view.setBounds(m.bounds);
      mobile.applyMobile(tab, m.scale);
    } else {
      tab.view.setBounds(page);
      mobile.applyMobile(tab);
    }
  });
}

// Les événements des pages arrivent par rafales (chargement, titre, son…) : un seul envoi par
// tour et par fenêtre.
function sendState() {
  if (state.stateQueued) return;
  state.stateQueued = true;
  setImmediate(() => {
    state.stateQueued = false;
    sendStateNow();
  });
}

// Pour un réglage qui touche toutes les fenêtres (mode mobile…).
function layoutAll() {
  for (const w of state.allWindows()) state.inWindow(w, layout);
}

function sendStateAll() {
  for (const w of state.allWindows()) state.inWindow(w, sendState);
}

function sendStateNow() {
  if (!state.win || state.win.isDestroyed()) return;
  const tab = tabList.activeTab();
  if (!tab || state.panes.some((p) => !tabList.getTab(p.tabId))) return; // pendant la création d'un écran
  const favHere = tab && (!tab.screen || tab.screen.kind === 'tty') && fav.findByUrl(state.favorites.data.tree, tab.url);
  state.win.webContents.send('state', {
    user: os.userInfo().username,
    lang: getLang(),
    accent: theme.accentColor(),
    light: theme.isLight(),
    private: !!state.privateMode,
    platform: process.platform,
    engine: state.settings.data.engine,
    tabs: state.tabs.map((t, i) => ({ id: t.id, n: i + 1, side: tabList.sideOf(t), title: tabList.tabTitle(t), loading: t.loading, pane: tabList.paneOf(t), audible: !!t.audible, muted: audio.isMuted(t), private: !!t.private, favicon: !t.screen && t.view ? t.favicon || null : null })),
    panes: state.panes.map((p) => {
      const t = tabList.getTab(p.tabId);
      return {
        tabId: p.tabId,
        screen: t.screen,
        page: !!t.view && !t.screen && !t.blank,
        dev: !!(t.dev && t.devOpen && !t.devWin && !t.screen),
        url: t.url,
        title: t.screen ? tabList.tabTitle(t) : t.title || hostOf(t.url) || tr('nouvel onglet'),
        host: hostLabel(t),
        private: !!t.private,
      };
    }),
    activePane: state.activePane,
    status: {
      mode: tab.screen ? tabList.tabTitle(tab).split(':')[0].toUpperCase() : 'SITE',
      host: hostLabel(tab),
      url: tab.screen && tab.screen.kind !== 'tty' ? '' : tab.url,
      fav: favHere ? favHere.path : null,
      split: state.panes.length > 1,
      devtools: tab.devOpen ? (tab.devWin ? 'detached' : 'docked') : null,
      zoom: tab.view && tab.view.webContents && !tab.screen ? Math.round(tab.view.webContents.getZoomFactor() * 100) : 100,
    },
    exts: state.exts.summary(),
    downloads: state.downloads.filter((d) => d.state === 'progressing').length,
    audio: audio.audioState(),
  });
}

// Ce qui suit « @ » dans l'invite : le site, l'écran, ou l'IA de la discussion.
function hostLabel(tab) {
  if (tab.screen && tab.screen.kind === 'ai') return tab.screen.provider.toLowerCase();
  return tab.screen && tab.screen.kind !== 'tty' ? tabList.tabTitle(tab) : hostOf(tab.url);
}

function hostOf(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return url || '';
  }
}

Object.assign(module.exports, { setHtmlFullscreen, layout, layoutAll, sendState, sendStateAll, hostOf });
