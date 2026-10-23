'use strict';

const crypto = require('crypto');
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
const favicon = require('./favicon');
const mobile = require('../page/mobile');

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

const tabOfContents = (wc) => state.allTabs().find((t) => t.view && t.view.webContents === wc);

// Boutons précédent / suivant de la souris dans une page : Chromium y remonterait l'historique
// de la page tout seul, sans passer par back (écrans de résultats, de l'IA…). Le script les
// intercepte dans un monde isolé et les signale par un message de console marqué.
const NAV_MARK = `__zenith_nav_${crypto.randomBytes(8).toString('hex')}:`;
const NAV_SCRIPT = `if (!window.__zenithNav) {
  window.__zenithNav = true;
  const stop = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
  addEventListener('mousedown', stop, true);
  addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    console.debug('${NAV_MARK}' + (e.button === 3 ? -1 : 1));
  }, true);
}`;

function wireWebContents(tab, wc) {
  // Ses événements se traitent dans la fenêtre où se trouve l'onglet à ce moment-là.
  state.bindEmitter(wc, () => state.windowOfTab(tab));
  wc.on('did-start-navigation', (details) => {
    if (!details.isMainFrame) return;
    googleLogin.matchUserAgent(wc, details.url);
    mobile.applyMobile(tab);
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
    favicon.faviconLoaded(tab);
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
  wc.on('page-favicon-updated', (e, favicons) => favicon.setFavicon(tab, favicons[0]));
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
    favicon.faviconNavigated(tab);
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
  // Après une commande, le focus reste au terminal même si la page le prend (chargement lent,
  // nouvel onglet) ; il passe à la page seulement par un clic dedans, Échap ou un numéro de « clicks ».
  wc.on('focus', () => {
    if (state.lastCommandAt) output.focusTerminal();
  });
  wc.on('dom-ready', () => wc.executeJavaScriptInIsolatedWorld(1003, [{ code: NAV_SCRIPT }]).catch(() => {}));
  wc.on('console-message', (e) => {
    if (!e.message || !e.message.startsWith(NAV_MARK)) return;
    const p = tabList.paneOf(tab);
    if (p < 0) return;
    state.activePane = p;
    navigation.mouseNav(Number(e.message.slice(NAV_MARK.length)) < 0 ? -1 : 1);
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
  wc.setWindowOpenHandler(({ url, disposition }) => state.inWindow(state.windowOfTab(tab), () => {
    // Les vraies popups (connexion OAuth, etc.) restent des fenêtres ; le reste devient un onglet.
    if (disposition === 'new-window') return { action: 'allow' };
    tabList.createTab({ url, background: disposition === 'background-tab', priv: tab.private, opener: tab });
    return { action: 'deny' };
  }));
}

Object.assign(module.exports, { ensureView, tabOfContents });
