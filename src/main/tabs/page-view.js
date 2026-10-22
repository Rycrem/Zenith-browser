'use strict';

const { WebContentsView } = require('electron');
const { t } = require('../../shared/i18n');
const state = require('../state');
const googleLogin = require('../security/google-login');
const hist = require('../history/history');
const ui = require('../window/ui');
const tabList = require('./tabs');
const lastSession = require('./last-session');
const chromeApis = require('../extensions/chrome-api');
const webStore = require('../extensions/web-store');
const navigation = require('./navigation');
const screens = require('../terminal/screens');
const output = require('../terminal/output');
const tty = require('../page/tty');
const contextMenu = require('./context-menu');
const audio = require('../audio/audio');

function ensureView(tab) {
  if (tab.view) return tab.view;
  const view = new WebContentsView({ webPreferences: { session: tabList.sesOf(tab), sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#ffffff');
  view.setVisible(false);
  state.win.contentView.addChildView(view);
  tab.view = view;
  wireWebContents(tab, view.webContents);
  // La bibliothèque des extensions croit chaque nouvel onglet actif et demande à l'afficher :
  // un onglet ouvert en arrière-plan (Ctrl+clic) ne doit pas passer devant.
  state.addingTab = true;
  try {
    tabList.apiOf(tab).addTab(view.webContents, state.win);
  } finally {
    state.addingTab = false;
  }
  const shown = tabList.activeTab();
  if (shown && shown.view && shown.private === tab.private) tabList.apiOf(tab).selectTab(shown.view.webContents);
  return view;
}

const tabOfContents = (wc) => state.tabs.find((t) => t.view && t.view.webContents === wc);

function wireWebContents(tab, wc) {
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame) googleLogin.matchUserAgent(wc, details.url);
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    ui.sendState();
  });
  // « Couper tout » s'applique aussi aux onglets ouverts ensuite.
  if (state.settings.data.muteAll) {
    wc.setAudioMuted(true);
    tab.mutedByAll = true;
  }
  // Son : onglet qui en joue (haut-parleur), média en lecture ou en pause (player en bas).
  wc.on('audio-state-changed', (e) => {
    tab.audible = e && e.audible !== undefined ? e.audible : wc.isCurrentlyAudible();
    audio.audioChanged();
  });
  wc.on('media-started-playing', () => {
    tab.media = 'playing';
    tab.pausedByPlayer = false;
    audio.audioChanged();
  });
  wc.on('media-paused', () => {
    tab.media = 'paused';
    tab.pausedAt = Date.now();
    audio.audioChanged();
  });
  // Vidéo en plein écran : la page couvre toute la fenêtre, onglets et barre d'état cachés.
  wc.on('enter-html-full-screen', () => ui.setHtmlFullscreen(tab, true));
  wc.on('leave-html-full-screen', () => ui.setHtmlFullscreen(tab, false));
  wc.on('did-navigate', () => {
    tab.media = null;
    tab.pausedByPlayer = false;
    audio.audioChanged();
  });
  wc.on('did-frame-finish-load', () => audio.applyVolume(tab));
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    tab.blank = false;
    // Notre bouton seulement si le store n'a pas appelé webstorePrivate entre-temps (le sien marche alors).
    setTimeout(() => webStore.storeButton(tab), 2000);
    // Une seconde plus tard aussi : l'extension a fini de traiter « page chargée » entre-temps.
    chromeApis.highlightForExtensions(tab);
    setTimeout(() => chromeApis.highlightForExtensions(tab), 1000);
    ui.sendState();
    if (tab.tty && (!tab.screen || tab.screen.kind === 'tty')) tty.showTty(tab, true);
  });
  // Le texte s'affiche dès que la page est lue, sans attendre les images ou ce qui traîne.
  wc.on('dom-ready', () => {
    navigation.unblank(tab);
    if (tab.tty && (!tab.screen || tab.screen.kind === 'tty')) tty.showTty(tab, true);
  });
  wc.on('page-title-updated', (e, title) => {
    tab.title = title;
    const last = state.history.data.entries[state.history.data.entries.length - 1];
    if (last && last.url === tab.url) {
      last.title = title;
      state.history.save();
    }
    ui.sendState();
  });
  wc.on('did-navigate', (e, url) => {
    navigation.recordNavigation(tab, wc);
    tab.url = url;
    if (tab.numberedKind === 'links') tab.numbered = [];
    // En mode tty, l'ancien texte laisse place à « chargement… » (aussi après back et fwd).
    if (tab.tty && tab.screen && tab.screen.kind === 'tty') screens.setScreen(tab, tty.ttyLoading(url), []);
    hist.addHistory({ url, title: wc.getTitle() }, tab);
    webStore.storeHint(tab, url);
    lastSession.saveSession();
    ui.sendState();
  });
  wc.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    webStore.storeHint(tab, url);
    webStore.storeButton(tab);
    ui.sendState();
    // Les sites d'une seule page changent leur contenu sans recharger : on relit le texte.
    if (tab.tty && tab.screen && tab.screen.kind === 'tty') setTimeout(() => tab.tty && tab.screen && tab.screen.kind === 'tty' && tty.showTty(tab, true), 600);
  });
  wc.on('console-message', (event, ...old) => {
    const message = event.message !== undefined ? event.message : old[1];
    if (message === `${webStore.STORE_SECRET}:install`) webStore.installFromStore(tab).catch(() => {});
  });
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame) navigation.unblank(tab);
    if (isMainFrame && code !== -3) output.print([{ t: t('impossible de charger {url} : {desc}', { url, desc }), c: 'err' }]);
  });
  wc.on('focus', () => {
    chromeApis.highlightForExtensions(tab);
    const p = tabList.paneOf(tab);
    if (p >= 0 && p !== state.activePane) {
      state.activePane = p;
      tabList.apiOf(tab).selectTab(wc);
      ui.sendState();
    }
  });
  // Une page peut se fermer elle-même (window.close(), par exemple après une connexion) :
  // l'onglet disparaît avec elle.
  wc.once('destroyed', () => {
    if (state.win && !state.win.isDestroyed()) tabList.closeTab(tab);
  });
  // Ctrl+molette : Electron le signale sans zoomer lui-même.
  wc.on('zoom-changed', (e, dir) => {
    wc.setZoomLevel(wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5));
    ui.sendState();
  });
  // Une page qui prend le focus juste après une commande (chargement, nouvel onglet) le rend au terminal ;
  // un clic dans la page, lui, le garde.
  wc.on('focus', () => {
    if (Date.now() - state.lastCommandAt < 5000) output.focusTerminal();
  });
  wc.on('input-event', (e, input) => {
    if (input.type === 'mouseDown') state.lastCommandAt = 0;
  });
  wc.on('found-in-page', (e, r) => {
    if (!r.finalUpdate) return;
    if (state.findWin && state.findWin.tabId === tab.id && !state.findWin.win.isDestroyed()) state.findWin.win.webContents.send('panel:data', { ordinal: r.activeMatchOrdinal, matches: r.matches });
    else output.print([{ t: `  ${r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : t('aucun résultat')}`, c: 'dim' }]);
  });
  wc.on('context-menu', (e, params) => contextMenu.showContextMenu(tab, params));
  wc.setWindowOpenHandler(({ url, disposition }) => {
    // Les vraies popups (connexion OAuth, etc.) restent des fenêtres ; le reste devient un onglet.
    if (disposition === 'new-window') return { action: 'allow' };
    tabList.createTab({ url, background: disposition === 'background-tab', priv: tab.private });
    return { action: 'deny' };
  });
}

Object.assign(module.exports, { ensureView, tabOfContents });
