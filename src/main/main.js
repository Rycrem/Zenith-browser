'use strict';

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session, shell, clipboard, net, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('./store');
const { Extensions, newer } = require('./extensions');
const bookmarks = require('../shared/bookmarks-import');
const { AdBlock } = require('./adblock');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const ai = require('./ai');
const updater = require('./updater');
const fav = require('../shared/favorites');
const C = require('../shared/commands');
const { notesFor, exactNotes, releaseNotes } = require('../shared/changelog');
const { t, mark, setLang, getLang } = require('../shared/i18n');

const tr = t; // là où une variable locale « t » (un onglet) cache t()
const { storeExtensionId } = require('../shared/crx');
const { parseDuckDuckGoHtml, parseNextPage, shortUrl } = require('../shared/search');

// Lancée depuis le code, l'appli garde ses données à part : la version installée chiffre
// ses cookies (fuse Electron), et un Electron sans ce réglage ne saurait plus les lire.
if (!app.isPackaged) {
  const shared = app.getPath('userData');
  const dev = `${shared}-dev`;
  // Les données créées avant cette séparation suivent la version lancée depuis le code.
  if (fs.existsSync(shared) && !fs.existsSync(dev)) fs.cpSync(shared, dev, { recursive: true });
  app.setPath('userData', dev);
}

// Sans les mentions Electron et dev-brows, les sites voient un Chrome ordinaire.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/\S+/, '')
  .replace(/ dev-brows\/\S+/, '');

// La connexion Google refuse les navigateurs basés sur Electron (« Ce navigateur ou cette application
// ne sont peut-être pas sécurisés »). Sur accounts.google.com seulement, on se présente comme Firefox :
// en-tête User-Agent, navigator.userAgent, et sans les en-têtes Sec-CH-UA propres à Chromium.
const GOOGLE_LOGIN = 'accounts.google.com';
function firefoxUserAgent() {
  // Firefox sort une version toutes les 4 semaines (140 le 24 juin 2025) ; on annonce l'avant-dernière.
  const version = 140 + Math.floor((Date.now() - Date.UTC(2025, 5, 24)) / (28 * 24 * 3600 * 1000)) - 1;
  const platform = {
    win32: 'Windows NT 10.0; Win64; x64',
    darwin: 'Macintosh; Intel Mac OS X 10.15',
  }[process.platform] || 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
}
const isGoogleLogin = (url) => {
  try {
    return new URL(url).hostname === GOOGLE_LOGIN;
  } catch {
    return false;
  }
};

// Le filtre d'en-têtes n'est posé que pendant une connexion Google : tant qu'un filtre
// session.webRequest existe (celui-ci ou le bloqueur intégré), Electron ignore le
// chrome.webRequest des extensions.
const onGoogleLogin = new Set();

function setGoogleFilter(id, on) {
  const before = onGoogleLogin.size;
  if (on) onGoogleLogin.add(id);
  else onGoogleLogin.delete(id);
  if (!before && onGoogleLogin.size) {
    const ua = firefoxUserAgent();
    ses.webRequest.onBeforeSendHeaders({ urls: [`https://${GOOGLE_LOGIN}/*`] }, (details, callback) => {
      const headers = details.requestHeaders;
      for (const name of Object.keys(headers)) if (/^sec-ch-ua/i.test(name)) delete headers[name];
      headers['User-Agent'] = ua;
      callback({ requestHeaders: headers });
    });
  } else if (before && !onGoogleLogin.size) {
    ses.webRequest.onBeforeSendHeaders(null);
  }
}

function matchUserAgent(wc, url) {
  const ua = isGoogleLogin(url) ? firefoxUserAgent() : app.userAgentFallback;
  if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
}

// Onglets et fenêtres de connexion (popups OAuth comprises).
function setupGoogleLogin() {
  app.on('web-contents-created', (e, wc) => {
    const id = wc.id;
    const follow = (url) => setGoogleFilter(id, isGoogleLogin(url));
    wc.on('did-start-navigation', (d) => d.isMainFrame && follow(d.url));
    wc.on('will-redirect', (d) => d.isMainFrame && follow(d.url));
    wc.once('destroyed', () => setGoogleFilter(id, false));
  });
}

const THEMES = { ambre: '#F2A541', vert: '#7FD18B', cyan: '#6CC5D9', rose: '#E07AA8', violet: '#B48CF2' };
const HISTORY_MAX = 5000;
const DEVTOOLS_RATIO = 0.4;
const DEVBAR_H = 26; // barre de l'interface au-dessus des DevTools (détacher, fermer)

let win = null;
let ses = null;
let chromeApi = null; // API d'extensions Chrome (onglets, fenêtres…) qu'Electron ne fournit pas
let favorites = null; // JsonStore { tree }
let history = null; // JsonStore { entries }
let adblock = null;
let lastCommandAt = 0; // heure de la dernière commande tapée, pour garder le focus dans le terminal
let settings = null; // JsonStore { engine, theme, aliases, extensions }
let exts = null;

const tabs = [];
let nextTabId = 1;
const panes = [{ tabId: null }];
let activePane = 0;
let rects = [];
let dragging = false;
const prompts = []; // questions oui/non en attente, la première est affichée
let lastUndo = null;
const downloads = [];
let popupWin = null;
let extPopupClosed = { n: 0, at: 0 };
let panel = null; // popup de la barre du bas : { kind: 'dl' | 'fav', win, place }
let panelClosed = { kind: null, at: 0 };

// ---------------------------------------------------------------- onglets

function getTab(id) {
  return tabs.find((t) => t.id === id) || null;
}

function activeTab() {
  return getTab(panes[activePane].tabId);
}

function paneOf(tab) {
  return panes.findIndex((p) => p.tabId === tab.id);
}

function createTab({ url, background = false, pane = activePane } = {}) {
  const tab = { id: nextTabId++, view: null, dev: null, screen: null, numbered: [], title: '', url: '', loading: false };
  tabs.push(tab);
  if (url) navigate(tab, url);
  else showHome(tab);
  if (!background) showInPane(tab, pane);
  else sendState();
  return tab;
}

function ensureView(tab) {
  if (tab.view) return tab.view;
  const view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  view.setBackgroundColor('#ffffff');
  view.setVisible(false);
  win.contentView.addChildView(view);
  tab.view = view;
  wireWebContents(tab, view.webContents);
  chromeApi.addTab(view.webContents, win);
  // L'onglet peut déjà être affiché (page d'accueil qui charge un site) : les extensions doivent le savoir actif.
  if (panes[activePane] && panes[activePane].tabId === tab.id) chromeApi.selectTab(view.webContents);
  return view;
}

const tabOfContents = (wc) => tabs.find((t) => t.view && t.view.webContents === wc);

// chrome.tabs / chrome.windows des extensions, branchés sur les onglets de dev-brows.
function setupChromeApi() {
  chromeApi = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab(details) {
      const tab = createTab({ url: details.url || undefined, background: details.active === false });
      return [ensureView(tab).webContents, win];
    },
    selectTab(wc) {
      const tab = tabOfContents(wc);
      if (tab) showInPane(tab, activePane);
    },
    removeTab(wc) {
      const tab = tabOfContents(wc);
      if (tab) closeTab(tab);
    },
    // Les extensions ouvrent parfois une petite fenêtre (connexion, déverrouillage…).
    createWindow(details) {
      const popup = new BrowserWindow({
        width: details.width || 480,
        height: details.height || 640,
        parent: details.type === 'popup' ? win : undefined,
        title: 'dev-brows',
        webPreferences: { session: ses, sandbox: true, contextIsolation: true },
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
}

// Le Chrome Web Store grise « Ajouter à Chrome » hors de Chrome : on propose « ext add » à la place.
function storeHint(tab, url) {
  const id = storeExtensionId(url);
  if (!id || tab.storeHint === id) return;
  tab.storeHint = id;
  const installed = exts.list.some((e) => e.id === id);
  print([{ t: installed ? t('  extension déjà installée (« ext » pour la gérer)') : t('  ↓ le bouton « Ajouter à Chrome » ne marche pas ici : tape « ext add » pour installer cette extension'), c: installed ? 'dim' : 'warn' }]);
}

function wireWebContents(tab, wc) {
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame) matchUserAgent(wc, details.url);
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    sendState();
  });
  // « Couper tout » s'applique aussi aux onglets ouverts ensuite.
  if (settings.data.muteAll) {
    wc.setAudioMuted(true);
    tab.mutedByAll = true;
  }
  // Son : onglet qui en joue (haut-parleur), média en lecture ou en pause (player en bas).
  wc.on('audio-state-changed', (e) => {
    tab.audible = e && e.audible !== undefined ? e.audible : wc.isCurrentlyAudible();
    audioChanged();
  });
  wc.on('media-started-playing', () => {
    tab.media = 'playing';
    audioChanged();
  });
  wc.on('media-paused', () => {
    tab.media = 'paused';
    audioChanged();
  });
  wc.on('did-navigate', () => {
    tab.media = null;
    audioChanged();
  });
  wc.on('did-frame-finish-load', () => applyVolume(tab));
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    sendState();
    if (tab.tty && (!tab.screen || tab.screen.kind === 'tty')) showTty(tab, true);
  });
  // Le texte s'affiche dès que la page est lue, sans attendre les images ou ce qui traîne.
  wc.on('dom-ready', () => {
    if (tab.tty && (!tab.screen || tab.screen.kind === 'tty')) showTty(tab, true);
  });
  wc.on('page-title-updated', (e, title) => {
    tab.title = title;
    const last = history.data.entries[history.data.entries.length - 1];
    if (last && last.url === tab.url) {
      last.title = title;
      history.save();
    }
    sendState();
  });
  wc.on('did-navigate', (e, url) => {
    tab.url = url;
    if (tab.numberedKind === 'links') tab.numbered = [];
    // En mode tty, l'ancien texte laisse place à « chargement… » (aussi après back et fwd).
    if (tab.tty && tab.screen && tab.screen.kind === 'tty') setScreen(tab, ttyLoading(url), []);
    addHistory({ url, title: wc.getTitle() });
    storeHint(tab, url);
    sendState();
  });
  wc.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    storeHint(tab, url);
    sendState();
    // Les sites d'une seule page changent leur contenu sans recharger : on relit le texte.
    if (tab.tty && tab.screen && tab.screen.kind === 'tty') setTimeout(() => tab.tty && tab.screen && tab.screen.kind === 'tty' && showTty(tab, true), 600);
  });
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) print([{ t: t('impossible de charger {url} : {desc}', { url, desc }), c: 'err' }]);
  });
  wc.on('focus', () => {
    const p = paneOf(tab);
    if (p >= 0 && p !== activePane) {
      activePane = p;
      chromeApi.selectTab(wc);
      sendState();
    }
  });
  // Une page peut se fermer elle-même (window.close(), par exemple après une connexion) :
  // l'onglet disparaît avec elle.
  wc.once('destroyed', () => {
    if (win && !win.isDestroyed()) closeTab(tab);
  });
  // Ctrl+molette : Electron le signale sans zoomer lui-même.
  wc.on('zoom-changed', (e, dir) => {
    wc.setZoomLevel(wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5));
    sendState();
  });
  // Une page qui prend le focus juste après une commande (chargement, nouvel onglet) le rend au terminal ;
  // un clic dans la page, lui, le garde.
  wc.on('focus', () => {
    if (Date.now() - lastCommandAt < 5000) focusTerminal();
  });
  wc.on('input-event', (e, input) => {
    if (input.type === 'mouseDown') lastCommandAt = 0;
  });
  wc.on('found-in-page', (e, r) => {
    if (r.finalUpdate) print([{ t: `  ${r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : t('aucun résultat')}`, c: 'dim' }]);
  });
  wc.on('context-menu', (e, params) => showContextMenu(tab, params));
  wc.setWindowOpenHandler(({ url, disposition }) => {
    // Les vraies popups (connexion OAuth, etc.) restent des fenêtres ; le reste devient un onglet.
    if (disposition === 'new-window') return { action: 'allow' };
    createTab({ url, background: disposition === 'background-tab' });
    return { action: 'deny' };
  });
}

function navigate(tab, url) {
  const view = ensureView(tab);
  tab.screen = tab.tty ? ttyLoading(url) : null;
  tab.url = url;
  tab.title = shortUrl(url);
  view.webContents.loadURL(url).catch(() => {});
  layout();
  sendState();
}

function showInPane(tab, idx) {
  const other = panes.findIndex((p, i) => i !== idx && p.tabId === tab.id);
  if (other >= 0) panes[other].tabId = panes[idx].tabId; // échange si l'onglet est déjà dans l'autre écran
  panes[idx].tabId = tab.id;
  activePane = idx;
  if (tab.view?.webContents) chromeApi.selectTab(tab.view.webContents);
  layout();
  sendState();
}

function closePane(idx) {
  if (panes.length === 1) throw new Error(t('pas de split en cours'));
  const keep = panes[1 - idx];
  panes.splice(0, panes.length, keep);
  activePane = 0;
  layout();
  sendState();
}

function destroyTab(tab) {
  if (tab.devWin) attachDevtools(tab);
  for (const v of [tab.view, tab.dev]) {
    if (!v) continue;
    win.contentView.removeChildView(v);
    if (v.webContents) v.webContents.close(); // déjà détruit si la page s'est fermée seule
  }
}

function closeTab(tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  destroyTab(tab);
  panes.forEach((p, pi) => {
    if (p.tabId !== tab.id) return;
    const shown = new Set(panes.map((q) => q.tabId));
    const next = tabs[Math.min(i, tabs.length - 1)];
    const candidate = next && !shown.has(next.id) ? next : tabs.find((t) => !shown.has(t.id));
    p.tabId = candidate ? candidate.id : createTab({ background: true }).id;
    if (pi === activePane) focusTerminal();
  });
  layout();
  sendState();
}

function cycleTab(dir) {
  const tab = activeTab();
  const i = tabs.indexOf(tab);
  showInPane(tabs[(i + dir + tabs.length) % tabs.length], activePane);
}

function setScreen(tab, screen, numbered = [], kind = screen.kind) {
  tab.screen = screen;
  tab.numbered = numbered;
  tab.numberedKind = kind;
  layout();
  sendState();
}

function tabTitle(tab) {
  if (!tab.screen) return tab.title || shortUrl(tab.url) || t('nouvel onglet');
  const s = tab.screen;
  return { home: t('accueil'), ai: `ia: ${s.question}`, results: `brows: ${s.query}`, fav: 'fav', hist: 'hist', ext: 'ext', dl: 'dl', tabs: 'tab', help: 'help', alias: 'alias', aiproviders: 'ia', tty: `tty: ${s.title || s.host}` }[s.kind] || s.kind;
}

// ---------------------------------------------------------------- disposition

function layout() {
  if (!win) return;
  tabs.forEach((tab) => {
    const p = paneOf(tab);
    const r = rects[p];
    const visible = p >= 0 && r && !tab.screen && !dragging && r.width > 0 && r.height > 0;
    const devOpen = visible && tab.dev && tab.devOpen && !tab.devWin;
    if (tab.view) tab.view.setVisible(!!visible);
    if (tab.dev && !tab.devWin) tab.dev.setVisible(!!devOpen);
    if (!visible) return;
    if (devOpen) {
      const devW = Math.round(r.width * DEVTOOLS_RATIO);
      tab.view.setBounds({ x: r.x, y: r.y, width: r.width - devW, height: r.height });
      tab.dev.setBounds({ x: r.x + r.width - devW, y: r.y + DEVBAR_H, width: devW, height: Math.max(0, r.height - DEVBAR_H) });
    } else {
      tab.view.setBounds(r);
    }
  });
}

function sendState() {
  if (!win || win.isDestroyed()) return;
  const tab = activeTab();
  if (!tab || panes.some((p) => !getTab(p.tabId))) return; // pendant la création d'un écran
  const favHere = tab && (!tab.screen || tab.screen.kind === 'tty') && fav.findByUrl(favorites.data.tree, tab.url);
  win.webContents.send('state', {
    user: os.userInfo().username,
    lang: getLang(),
    accent: THEMES[settings.data.theme] || THEMES.ambre,
    engine: settings.data.engine,
    tabs: tabs.map((t, i) => ({ id: t.id, n: i + 1, title: tabTitle(t), loading: t.loading, pane: paneOf(t), audible: !!t.audible, muted: isMuted(t) })),
    panes: panes.map((p) => {
      const t = getTab(p.tabId);
      return { tabId: p.tabId, screen: t.screen, page: !!t.view && !t.screen, dev: !!(t.dev && t.devOpen && !t.devWin && !t.screen), url: t.url, title: t.screen ? tabTitle(t) : t.title || hostOf(t.url) || tr('nouvel onglet') };
    }),
    activePane,
    status: {
      mode: tab.screen ? tabTitle(tab).split(':')[0].toUpperCase() : 'SITE',
      host: tab.screen && tab.screen.kind !== 'tty' ? tabTitle(tab) : hostOf(tab.url),
      url: tab.screen && tab.screen.kind !== 'tty' ? '' : tab.url,
      fav: favHere ? favHere.path : null,
      split: panes.length > 1,
      devtools: tab.devOpen ? (tab.devWin ? 'detached' : 'docked') : null,
      zoom: tab.view && tab.view.webContents && !tab.screen ? Math.round(tab.view.webContents.getZoomFactor() * 100) : 100,
    },
    exts: exts.summary(),
    downloads: downloads.filter((d) => d.state === 'progressing').length,
    audio: audioState(),
  });
}

function hostOf(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return url || '';
  }
}

function print(lines) {
  if (win && !win.isDestroyed()) win.webContents.send('term:print', lines);
}

function focusTerminal(prefill) {
  if (!win) return;
  win.webContents.focus();
  win.webContents.send('term:focus', prefill);
}

// ---------------------------------------------------------------- écrans internes

// Enregistre les favoris et met à jour ce qui les affiche : accueil, liste des favoris, popup.
function saveFavorites() {
  favorites.save();
  for (const tab of tabs) {
    if (!tab.screen) continue;
    try {
      if (tab.screen.kind === 'home') showHome(tab);
      else if (tab.screen.kind === 'fav') showFav(tab, tab.screen.folder);
    } catch {
      showFav(tab, ''); // le dossier affiché n'existe plus
    }
  }
  sendPanel('fav');
  sendState();
}

function showHome(tab) {
  const recent = fav.recent(favorites.data.tree, 6);
  setScreen(
    tab,
    { kind: 'home', user: os.userInfo().username, recent: recent.map((r, i) => ({ n: i + 1, path: r.path, url: r.url })), changes: notesFor(app.getVersion(), getLang()) },
    recent.map((r) => ({ kind: 'url', url: r.url })),
  );
}

function showFav(tab, folder) {
  const tree = favorites.data.tree;
  const node = folder ? fav.getNode(tree, folder) : tree;
  if (!node || node.type !== 'folder') throw new Error(t('dossier introuvable : {folder}', { folder }));
  const prefix = folder ? fav.splitPath(folder).join('/') : '';
  const rows = fav.flatten(node, prefix);
  const numbered = [];
  rows.forEach((r) => {
    if (r.type === 'link') {
      numbered.push({ kind: 'url', url: r.url, path: r.path });
      r.n = numbered.length;
    }
  });
  setScreen(tab, { kind: 'fav', folder: prefix, rows, counts: fav.countAll(node) }, numbered);
}

function showHist(tab, filter) {
  const f = (filter || '').toLowerCase();
  const rows = [];
  const numbered = [];
  const entries = history.data.entries;
  for (let i = entries.length - 1; i >= 0 && rows.length < 200; i--) {
    const e = entries[i];
    const label = e.query ? `brows « ${e.query} »` : e.url;
    if (f && !`${label} ${e.title || ''}`.toLowerCase().includes(f)) continue;
    numbered.push(e.query ? { kind: 'search', query: e.query } : { kind: 'url', url: e.url });
    rows.push({ n: numbered.length, time: e.time, label: e.query ? label : shortUrl(e.url), title: e.title || '' });
  }
  setScreen(tab, { kind: 'hist', filter: filter || '', rows, total: entries.length }, numbered);
}

function showTabs(tab) {
  setScreen(
    tab,
    { kind: 'tabs', rows: tabs.map((t, i) => ({ n: i + 1, title: tabTitle(t), url: t.screen ? '' : t.url, pane: paneOf(t) })) },
    tabs.map((t) => ({ kind: 'tab', id: t.id })),
  );
}

function showExt(tab) {
  const rows = exts.summary();
  setScreen(tab, { kind: 'ext', rows }, rows.map((r) => ({ kind: 'ext', n: r.n })));
}

function showDl(tab) {
  const rows = downloads.map((d, i) => ({ n: i + 1, name: d.name, state: d.state, received: d.received, total: d.total, path: d.path }));
  setScreen(tab, { kind: 'dl', rows }, downloads.map((d) => ({ kind: 'dl', path: d.path })));
}

function addHistory(entry) {
  const entries = history.data.entries;
  const last = entries[entries.length - 1];
  if (last && last.url === entry.url && !entry.query) return;
  entries.push({ ...entry, time: Date.now() });
  if (entries.length > HISTORY_MAX) entries.splice(0, entries.length - HISTORY_MAX);
  history.save();
}

// ---------------------------------------------------------------- recherche

async function runSearch(tab, query, form) {
  const engine = settings.data.engine;
  if (!form) addHistory({ url: `brows:${query}`, query, title: `brows « ${query} »` });
  if (engine !== 'ddg') {
    navigate(tab, C.ENGINES[engine].url(query));
    return [{ t: t('  page de résultats ouverte, tape « links » pour numéroter les liens'), c: 'dim' }];
  }
  let html;
  try {
    const res = form
      ? await net.fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
      })
      : await net.fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${getLang() === 'en' ? 'us-en' : 'fr-fr'}`);
    html = await res.text();
  } catch (err) {
    return [{ t: t('recherche impossible : {error}', { error: err.message }), c: 'err' }];
  }
  const results = parseDuckDuckGoHtml(html);
  if (!results.length) {
    // DuckDuckGo a pu demander une vérification : on affiche sa page telle quelle.
    navigate(tab, C.ENGINES.ddg.url(query));
    return [{ t: t('  aucun résultat lisible, page DuckDuckGo ouverte (tape « links »)'), c: 'warn' }];
  }
  const prev = form && tab.screen && tab.screen.kind === 'results' ? tab.screen : null;
  const page = prev ? prev.page + 1 : 1;
  const next = parseNextPage(html);
  setScreen(
    tab,
    {
      kind: 'results',
      query,
      page,
      engine: C.ENGINES.ddg.label,
      results: results.map((r, i) => ({ n: i + 1, ...r, short: shortUrl(r.url) })),
      next,
      prev,
    },
    results.map((r) => ({ kind: 'url', url: r.url })),
  );
  return [{ t: t('  {count} résultats, page {page} · n page suivante · tape un numéro', { count: results.length, page }), c: 'dim' }];
}

// ---------------------------------------------------------------- liens numérotés dans la page

const LINKS_SCRIPT = `(() => {
  document.querySelectorAll('.__devbrows_hint').forEach((e) => e.remove());
  const sel = 'a[href], button, input[type=submit], input[type=button], [role=button], [role=link], summary';
  const vw = innerWidth, vh = innerHeight, els = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    els.push(el);
    if (els.length >= 300) break;
  }
  window.__devBrows = els;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const h = document.createElement('span');
    h.className = '__devbrows_hint';
    h.textContent = i + 1;
    h.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;background:__ACCENT__;color:#0E1116;font:bold 11px/1.4 monospace;padding:0 4px;border-radius:3px;transform:translate(-70%,-45%);box-shadow:0 1px 3px rgba(0,0,0,.4)';
    document.documentElement.appendChild(h);
  });
  return els.map((el) => ({ href: el.href || null, text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 80) }));
})()`;

// Mode tty : la page en texte simple. Titres, paragraphes, listes et blocs de code ; chaque
// lien a un numéro (le même pour une même adresse). Les éléments cachés sont ignorés.
const TTY_SCRIPT = `(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'OBJECT', 'EMBED']);
  const BLOCK = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'flow-root']);
  const blocks = [];
  const links = [];
  const seen = new Map();
  let cur = null;
  const flush = () => {
    if (cur) {
      if (cur.parts.length) {
        cur.parts[0].text = cur.parts[0].text.replace(/^\\s+/, '');
        const last = cur.parts[cur.parts.length - 1];
        last.text = last.text.replace(/\\s+$/, '');
      }
      if (cur.parts.some((p) => p.text.trim())) blocks.push(cur);
    }
    cur = null;
  };
  const add = (raw, link) => {
    let text = raw.replace(/\\s+/g, ' ');
    if (!text || (text === ' ' && !cur)) return;
    if (!cur) cur = { type: 'p', parts: [] };
    const last = cur.parts[cur.parts.length - 1];
    // « CopilotWrite » : deux morceaux de texte collés sans style, on les sépare.
    if (link && last && last.link === link && /[a-z0-9.]$/.test(last.text) && /^[A-Z]/.test(text)) text = ' ' + text;
    if (last && last.link === link) last.text += text;
    else cur.parts.push(link ? { text, link } : { text });
  };
  const walk = (node, link) => {
    for (const n of node.childNodes) {
      if (blocks.length > 3000) return;
      if (n.nodeType === 3) {
        add(n.textContent, link);
        continue;
      }
      if (n.nodeType !== 1 || SKIP.has(n.tagName.toUpperCase())) continue;
      const tag = n.tagName.toUpperCase();
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true') continue;
      if (tag === 'IMG') {
        if (link && n.alt && n.alt.trim()) add(n.alt.trim(), link);
        continue;
      }
      if (tag === 'BR') {
        flush();
        continue;
      }
      if (tag === 'PRE') {
        flush();
        if (n.innerText.trim()) blocks.push({ type: 'pre', parts: [{ text: n.innerText.replace(/\\s+$/, '') }] });
        continue;
      }
      if (tag === 'A' && !link && /^https?:/.test(n.href)) {
        const href = n.href;
        let k = seen.get(href);
        if (!k) {
          links.push(href);
          k = links.length;
          seen.set(href, k);
        }
        walk(n, k);
        continue;
      }
      const heading = /^H[1-6]$/.test(tag);
      const block = heading || tag === 'LI' || tag === 'P' || tag === 'TR' || BLOCK.has(cs.display);
      if (block && link) {
        // Bloc dans un lien : on reste dans le lien, séparé par une espace.
        add(' ', link);
        walk(n, link);
        add(' ', link);
        continue;
      }
      if (heading || tag === 'LI') {
        flush();
        cur = { type: heading ? 'h' : 'li', parts: [] };
        walk(n, link);
        flush();
        continue;
      }
      if (block) {
        flush();
        walk(n, link);
        flush();
        continue;
      }
      walk(n, link);
    }
  };
  walk(document.body || document.documentElement, 0);
  flush();
  return { title: document.title, blocks, links };
})()`;

function ttyLoading(url) {
  return { kind: 'tty', host: hostOf(url), url, title: '', blocks: [], links: 0, loading: true };
}

async function showTty(tab, ready) {
  if (!tab.view) return;
  const wc = tab.view.webContents;
  if (!ready && wc.isLoading()) {
    setScreen(tab, ttyLoading(tab.url), []);
    return; // dom-ready ou did-stop-loading rappelle showTty
  }
  try {
    const r = await wc.executeJavaScript(TTY_SCRIPT);
    if (!tab.tty) return;
    setScreen(tab, { kind: 'tty', host: hostOf(tab.url), url: tab.url, title: r.title, blocks: r.blocks, links: r.links.length }, r.links.map((url) => ({ kind: 'url', url })));
  } catch (err) {
    setScreen(tab, { kind: 'tty', host: hostOf(tab.url), url: tab.url, title: '', blocks: [], links: 0, error: err.message }, []);
  }
}

async function numberLinks(tab) {
  if (!tab.view || tab.screen) throw new Error(t('aucune page ouverte'));
  const accent = THEMES[settings.data.theme] || THEMES.ambre;
  const links = await tab.view.webContents.executeJavaScript(LINKS_SCRIPT.replace('__ACCENT__', accent));
  tab.numbered = links.map((l, i) => ({ kind: 'link', i, href: l.href }));
  tab.numberedKind = 'links';
  return links.length;
}

async function clickLink(tab, i) {
  return tab.view.webContents.executeJavaScript(`(() => {
    const el = window.__devBrows && window.__devBrows[${i}];
    document.querySelectorAll('.__devbrows_hint').forEach((e) => e.remove());
    if (!el) return false;
    el.focus();
    el.click();
    return true;
  })()`, true); // true : compte comme un vrai clic, pour que « back » puisse revenir
}

// ---------------------------------------------------------------- outils de développement

function openDevtools(tab, x, y) {
  if (!tab.view) throw new Error(t('aucune page ouverte'));
  const wc = tab.view.webContents;
  if (!tab.dev) {
    // Les DevTools s'affichent dans une vue à droite de la page, comme dans Chrome.
    tab.dev = new WebContentsView();
    win.contentView.addChildView(tab.dev);
    wc.setDevToolsWebContents(tab.dev.webContents);
    // Avec une vue DevTools à nous, isDevToolsOpened() reste faux : on suit l'état nous-mêmes.
    wc.on('devtools-closed', () => {
      tab.devOpen = false;
      tab.devStarted = false;
      layout();
    });
  }
  if (tab.screen) tab.screen = null;
  if (!tab.devStarted) wc.openDevTools({ mode: 'detach', activate: false });
  tab.devStarted = true;
  tab.devOpen = true;
  if (x !== undefined) wc.inspectElement(x, y);
  layout();
  sendState();
}

function closeDevtools(tab) {
  if (tab.devWin) attachDevtools(tab);
  tab.devOpen = false;
  layout();
  sendState();
}

// Détache la vue DevTools dans sa propre fenêtre : on déplace la vue, la connexion à la page reste.
function detachDevtools(tab) {
  if (!tab.dev || !tab.devOpen || tab.devWin) return;
  const b = win.getBounds();
  const dw = new BrowserWindow({ width: Math.round(b.width * 0.45), height: b.height, x: b.x + b.width - Math.round(b.width * 0.45), y: b.y, title: `DevTools · ${tabTitle(tab)}`, autoHideMenuBar: true });
  win.contentView.removeChildView(tab.dev);
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
    layout();
    sendState();
  });
  tab.devWin = dw;
  layout();
  sendState();
}

function attachDevtools(tab) {
  const dw = tab.devWin;
  if (!dw) return;
  tab.devWin = null;
  if (!dw.isDestroyed()) {
    dw.contentView.removeChildView(tab.dev);
    dw.destroy();
  }
  win.contentView.addChildView(tab.dev);
  layout();
  sendState();
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

function showContextMenu(tab, p) {
  const wc = tab.view.webContents;
  const items = [
    { label: t('Précédent'), enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: t('Suivant'), enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: t('Recharger'), click: () => wc.reload() },
    { type: 'separator' },
  ];
  if (p.linkURL) {
    items.push(
      { label: t('Ouvrir le lien dans un nouvel onglet'), click: () => createTab({ url: p.linkURL, background: true }) },
      { label: t('Ouvrir le lien dans l\'autre écran'), click: () => openInOtherPane(p.linkURL) },
      { label: t('Copier l\'adresse du lien'), click: () => clipboard.writeText(p.linkURL) },
      { label: t('Télécharger le lien'), click: () => wc.downloadURL(p.linkURL) },
      { type: 'separator' },
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: t('Enregistrer l\'image (dans Téléchargements)'), click: () => wc.downloadURL(p.srcURL) },
      { label: t('Ouvrir l\'image dans un nouvel onglet'), click: () => createTab({ url: p.srcURL, background: true }) },
      { label: t('Copier l\'image'), click: () => wc.copyImageAt(p.x, p.y) },
      { label: t('Copier l\'adresse de l\'image'), click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' },
    );
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL && !p.srcURL.startsWith('blob:')) {
    items.push(
      { label: p.mediaType === 'video' ? t('Enregistrer la vidéo (dans Téléchargements)') : t('Enregistrer le son (dans Téléchargements)'), click: () => wc.downloadURL(p.srcURL) },
      { label: p.mediaType === 'video' ? t('Copier l\'adresse de la vidéo') : t('Copier l\'adresse du son'), click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' },
    );
  }
  if (p.isEditable) {
    items.push({ role: 'cut', label: t('Couper') }, { role: 'copy', label: t('Copier') }, { role: 'paste', label: t('Coller') }, { type: 'separator' });
  } else if (p.selectionText) {
    const text = p.selectionText.trim();
    items.push(
      { role: 'copy', label: t('Copier') },
      { label: t('Rechercher « {text} »', { text: `${text.slice(0, 30)}${text.length > 30 ? '…' : ''}` }), click: () => runCommand(`brows ${text}`) },
      { type: 'separator' },
    );
  }
  items.push(
    { label: t('Ajouter aux favoris…'), click: () => focusTerminal('add ') },
    { label: t('Code source de la page'), click: () => createTab({ url: `view-source:${tab.url}` }) },
    { type: 'separator' },
    { label: t('Inspecter'), click: () => openDevtools(tab, p.x, p.y) },
  );
  Menu.buildFromTemplate(items).popup({ window: win });
}

function openInOtherPane(url) {
  if (panes.length === 1) panes.push({ tabId: null });
  const target = activePane === 0 ? 1 : 0;
  const tab = createTab({ url, background: true });
  showInPane(tab, target);
}

// ---------------------------------------------------------------- son

// Volume : celui du navigateur (réglages) multiplié par celui de l'onglet, appliqué aux
// éléments <audio> et <video> de toutes les frames. À 100 %, rien n'est touché.
const MEDIA_SCRIPT = `((action, volume) => {
  const st = window.__devBrowsAudio || (window.__devBrowsAudio = { volume: 1, last: [] });
  const all = () => [...document.querySelectorAll('video, audio')];
  if (!st.hooked) {
    st.hooked = true;
    document.addEventListener('play', (e) => {
      if (st.volume !== 1 && e.target && 'volume' in e.target) e.target.volume = st.volume;
    }, true);
  }
  if (action === 'volume') {
    const changed = st.volume !== volume;
    st.volume = volume;
    if (changed) for (const el of all()) el.volume = volume;
    return null;
  }
  if (action === 'toggle') {
    const playing = all().filter((el) => !el.paused);
    if (playing.length) {
      for (const el of playing) el.pause();
      st.last = playing;
      return 'paused';
    }
    const el = st.last.find((x) => x.isConnected) || all().find((x) => x.currentTime > 0) || all()[0];
    if (!el) return null;
    el.play().catch(() => {});
    return 'playing';
  }
  return all().some((el) => !el.paused) ? 'playing' : all().some((el) => el.currentTime > 0) ? 'paused' : null;
})`;

const isMuted = (tab) => !!(tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.isAudioMuted());
const tabVolume = (tab) => (tab.volume === undefined ? 1 : tab.volume);
const globalVolume = () => (settings.data.volume === undefined ? 1 : settings.data.volume);

// Exécute MEDIA_SCRIPT dans chaque frame de l'onglet ; renvoie le résultat de la première qui répond.
async function mediaCall(tab, action, value) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return null;
  let result = null;
  for (const frame of tab.view.webContents.mainFrame.framesInSubtree) {
    try {
      const r = await frame.executeJavaScript(`${MEDIA_SCRIPT}(${JSON.stringify(action)}, ${Number(value) || 0})`, true);
      if (r && !result) result = r;
    } catch {}
  }
  return result;
}

function applyVolume(tab) {
  const v = Math.round(globalVolume() * tabVolume(tab) * 100) / 100;
  if (v === 1 && !tab.volumeSet) return;
  tab.volumeSet = v !== 1;
  mediaCall(tab, 'volume', v);
}

// Onglets qui jouent du son ou ont un média en cours (lecture ou pause).
function audioTabs() {
  return tabs.filter((t) => t.view && (t.audible || t.media));
}

function audioState() {
  const list = audioTabs();
  return {
    show: list.length > 0,
    playing: list.some((t) => t.audible),
    volume: globalVolume(),
    muted: !!settings.data.muteAll,
  };
}

let audioTimer = null;
function audioChanged() {
  // Les événements arrivent par rafales (plusieurs frames) : un seul envoi.
  clearTimeout(audioTimer);
  audioTimer = setTimeout(() => {
    sendState();
    sendPanel('audio');
  }, 50);
}

function setMuted(tab, muted) {
  if (!tab.view) return;
  tab.view.webContents.setAudioMuted(muted);
  audioChanged();
}

function setGlobalVolume(v) {
  settings.data.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  settings.save();
  for (const tab of tabs) applyVolume(tab);
  audioChanged();
}

// « Couper tout » coupe chaque onglet ; le rétablir rend le son à ceux qu'il avait coupés.
function setMuteAll(on) {
  settings.data.muteAll = on;
  settings.save();
  for (const tab of tabs) {
    if (!tab.view) continue;
    if (on && !isMuted(tab)) {
      tab.mutedByAll = true;
      tab.view.webContents.setAudioMuted(true);
    } else if (!on && tab.mutedByAll) {
      tab.mutedByAll = false;
      tab.view.webContents.setAudioMuted(false);
    }
  }
  audioChanged();
}

async function togglePlay(tab) {
  const r = await mediaCall(tab, 'toggle');
  if (r) tab.media = r;
  audioChanged();
}

function audioData() {
  return {
    title: t('son'),
    all: t('tout le navigateur'),
    volume: globalVolume(),
    muted: !!settings.data.muteAll,
    empty: t('Aucun onglet ne joue de son.'),
    hint: t('clic sur le titre : aller à l\'onglet'),
    labels: { play: t('lecture'), pause: t('pause'), mute: t('couper le son'), unmute: t('remettre le son'), down: t('baisser'), up: t('monter') },
    tabs: audioTabs().map((tb) => ({
      id: tb.id,
      n: tabs.indexOf(tb) + 1,
      title: tb.title || hostOf(tb.url),
      host: hostOf(tb.url),
      playing: tb.media === 'playing' || (!tb.media && tb.audible),
      audible: !!tb.audible,
      muted: isMuted(tb),
      volume: tabVolume(tb),
    })),
  };
}

// ---------------------------------------------------------------- popup des téléchargements

function formatSize(bytes) {
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < 3) {
    n /= 1024;
    u++;
  }
  const num = n.toLocaleString(getLang() === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: u ? 1 : 0 });
  return [t('{n} o', { n: num }), t('{n} Ko', { n: num }), t('{n} Mo', { n: num }), t('{n} Go', { n: num })][u];
}

function formatEta(seconds) {
  if (seconds < 60) return t('{n} s restantes', { n: Math.max(1, Math.round(seconds)) });
  if (seconds < 3600) return t('{n} min restantes', { n: Math.round(seconds / 60) });
  return t('{n} h restantes', { n: Math.round(seconds / 360) / 10 });
}

function dlRow(d, i) {
  const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
  let label;
  if (d.state === 'completed') label = `${formatSize(d.received)} · ${t('terminé')}`;
  else if (d.state === 'progressing') {
    const parts = [d.total ? `${formatSize(d.received)} / ${formatSize(d.total)}` : formatSize(d.received)];
    if (d.paused) parts.push(t('en pause'));
    else if (d.speed) {
      parts.push(t('{speed}/s', { speed: formatSize(d.speed) }));
      if (d.total) parts.push(formatEta((d.total - d.received) / d.speed));
    }
    label = parts.join(' · ');
  } else label = t('interrompu');
  return { i, name: d.name, state: d.state, pct, label };
}

function dlData() {
  return {
    title: t('téléchargements'),
    rows: downloads.map(dlRow),
    empty: t('Aucun téléchargement.'),
    dir: t('ouvrir le dossier Téléchargements'),
    hint: t('Ctrl+Maj+J'),
    folder: t('dossier'),
    folderTitle: t('Afficher dans le dossier'),
    openTitle: t('Ouvrir le fichier'),
  };
}

function favData() {
  const tab = activeTab();
  return {
    title: t('favoris'),
    tree: favorites.data.tree,
    current: tab && !tab.screen ? tab.url : '',
    empty: t('Aucun favori : « add nom » ajoute la page, « fav import » ceux d\'un autre navigateur.'),
    none: t('Aucun favori ne correspond.'),
    filter: t('filtrer…'),
    hint: t('Ctrl+Maj+B · Ctrl+clic : nouvel onglet'),
    openTitle: t('ouvrir (Ctrl+clic : nouvel onglet)'),
  };
}

const PANELS = {
  dl: { file: 'downloads.html', width: 420, data: dlData },
  fav: { file: 'favorites.html', width: 380, data: favData },
  audio: { file: 'audio.html', width: 440, data: audioData },
};

function sendPanel(kind) {
  if (!panel || panel.kind !== kind || panel.win.isDestroyed()) return;
  panel.win.webContents.send('panel:data', PANELS[kind].data());
}

const sendDl = () => sendPanel('dl');

// Ouvre la popup au-dessus de son bouton de la barre du bas, ou la ferme.
// x : bord droit du bouton (téléchargements, à droite) ou bord gauche (favoris, à gauche).
function togglePanel(kind, x) {
  if (panel && !panel.win.isDestroyed()) {
    const same = panel.kind === kind;
    panel.win.close();
    if (same) return;
  }
  // Le clic sur le bouton fait d'abord perdre le focus à la popup, qui se ferme : ce clic ne la rouvre pas.
  if (panelClosed.kind === kind && Date.now() - panelClosed.at < 300) return;
  const { file, width } = PANELS[kind];
  const b = win.getContentBounds();
  const place = (height) => {
    let left;
    if (kind === 'fav') left = b.x + (x !== undefined ? Math.round(x) : 0);
    else left = x !== undefined ? b.x + Math.round(x) - width : b.x + b.width - width - 16;
    return { x: Math.max(b.x, Math.min(left, b.x + b.width - width)), y: b.y + b.height - height - 28, width, height };
  };
  const pw = new BrowserWindow({
    ...place(160),
    parent: win,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#0E1116',
    webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), sandbox: true, contextIsolation: true },
  });
  panel = { kind, win: pw, place };
  pw.loadFile(path.join(__dirname, '../renderer', file), { query: { accent: THEMES[settings.data.theme] || THEMES.ambre } });
  pw.webContents.once('did-finish-load', () => sendPanel(kind));
  pw.once('ready-to-show', () => pw.show());
  pw.on('blur', () => !pw.isDestroyed() && pw.close());
  pw.on('closed', () => {
    panelClosed = { kind, at: Date.now() };
    if (panel && panel.win === pw) panel = null;
  });
  pw.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape') pw.close();
  });
}

// Actions demandées par une popup : seulement celles de son type, sur ses propres données.
async function panelAction(kind, action, arg) {
  if (kind === 'dl') {
    if (action === 'dir') return void shell.openPath(app.getPath('downloads'));
    const d = Number.isInteger(arg) ? downloads[arg] : null;
    if (!d) return;
    if (action === 'folder') shell.showItemInFolder(d.path);
    else if (action === 'open' && d.state === 'completed') {
      const err = await shell.openPath(d.path);
      if (err) print([{ t: `  ${err}`, c: 'err' }]);
    }
  } else if (kind === 'audio') {
    const v = arg && Number(arg.volume);
    if (action === 'global' && Number.isFinite(v)) return setGlobalVolume(v);
    if (action === 'muteAll') return setMuteAll(!settings.data.muteAll);
    const tab = arg && getTab(arg.id);
    if (!tab || !tab.view) return;
    if (action === 'mute') setMuted(tab, !isMuted(tab));
    else if (action === 'toggle') await togglePlay(tab);
    else if (action === 'volume' && Number.isFinite(v)) {
      tab.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
      applyVolume(tab);
      audioChanged();
    } else if (action === 'show') {
      showInPane(tab, activePane);
      if (panel && !panel.win.isDestroyed()) panel.win.close();
    }
  } else if (kind === 'fav' && action === 'open' && arg && typeof arg.url === 'string') {
    // Seulement une adresse qui est bien dans les favoris.
    if (!fav.allLinks(favorites.data.tree).some((l) => l.url === arg.url)) return;
    if (panel && panel.kind === 'fav' && !panel.win.isDestroyed()) panel.win.close();
    if (arg.newTab) createTab({ url: arg.url, background: true });
    else navigate(activeTab(), arg.url);
  }
}

// ---------------------------------------------------------------- extensions

// Avertissements et erreurs des extensions (fond, pages, scripts injectés), pour « ext log ».
const extLogs = new Map(); // identifiant → [{ time, where, text }]
const EXT_URL = /^chrome-extension:\/\/([a-p]{32})\//;

function logExt(id, where, text) {
  if (!extLogs.has(id)) extLogs.set(id, []);
  const list = extLogs.get(id);
  list.push({ time: Date.now(), where, text: String(text).slice(0, 400) });
  if (list.length > 100) list.shift();
}

// level : nombre de Chromium (2 avertissement, 3 erreur) ou nom (Electron récent).
const isProblem = (level) => level === 2 || level === 3 || level === 'warning' || level === 'error';

function watchExtensionLogs() {
  ses.serviceWorkers.on('console-message', (e, d) => {
    if (!d || !isProblem(d.level)) return;
    const worker = ses.serviceWorkers.getAllRunning()[d.versionId];
    const m = EXT_URL.exec((worker && worker.scope) || d.sourceUrl || '');
    if (m) logExt(m[1], t('fond'), d.lineNumber ? `${d.message} (${t('ligne')} ${d.lineNumber})` : d.message);
  });
  app.on('web-contents-created', (e, wc) => {
    wc.on('console-message', (event, ...old) => {
      const level = event.level !== undefined ? event.level : old[0];
      if (!isProblem(level)) return;
      const message = event.message !== undefined ? event.message : old[1];
      const line = event.lineNumber !== undefined ? event.lineNumber : old[2];
      const source = (event.sourceId !== undefined ? event.sourceId : old[3]) || '';
      // Script injecté dans un site (source chrome-extension://…), ou page de l'extension (popup, offscreen).
      const fromScript = EXT_URL.exec(source);
      const fromPage = EXT_URL.exec(wc.getURL());
      const m = fromScript || fromPage;
      if (!m) return;
      const where = fromPage ? t('page') : wc.getURL().startsWith('file:') ? 'dev-brows' : hostOf(wc.getURL()) || t('page');
      logExt(m[1], where, `${message} (${source.replace(EXT_URL, '')}${line ? `:${line}` : ''})`);
    });
  });
}

function extLogCommand(arg, say) {
  const list = exts.summary();
  // Le nom n'est cherché qu'à partir de 3 lettres, sinon « n » trouverait n'importe quelle extension.
  const q = String(arg || '').toLowerCase();
  const i = /^\d+$/.test(q) ? Number(q) - 1 : list.findIndex((x) => x.alias === arg || (q.length >= 3 && (x.name || '').toLowerCase().includes(q)));
  if (!arg || !list[i]) throw new Error(t('ext log <n | alias>'));
  const ext = exts.get(i + 1);
  const lines = (ext.id && extLogs.get(ext.id)) || [];
  if (!lines.length) return say(t('  aucune erreur de {name} depuis le lancement', { name: ext.name }), 'dim');
  say(t('  erreurs et avertissements de {name} depuis le lancement :', { name: ext.name }), 'dim');
  for (const l of lines.slice(-30)) say(`  ${new Date(l.time).toLocaleTimeString(getLang() === 'en' ? 'en-US' : 'fr-FR')} [${l.where}] ${l.text}`, 'err');
}

function openExtPopup(n, x) {
  const url = exts.popupUrl(n);
  // Un second clic (ou Alt+n) sur la même extension ferme sa popup.
  if (popupWin && !popupWin.isDestroyed()) {
    const same = popupWin.extN === n;
    popupWin.close();
    if (same) return;
  }
  // Le clic sur la pastille fait d'abord perdre le focus à la popup, qui se ferme : ce clic ne la rouvre pas.
  if (extPopupClosed.n === n && Date.now() - extPopupClosed.at < 300) return;
  const b = win.getContentBounds();
  const place = (w, h) => {
    const left = x !== undefined ? b.x + Math.round(x) - w + 60 : b.x + b.width - w - 16;
    return { x: Math.max(b.x, Math.min(left, b.x + b.width - w)), y: b.y + b.height - h - 36, width: w, height: h };
  };
  popupWin = new BrowserWindow({
    ...place(380, 480),
    parent: win,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: { session: ses, enablePreferredSizeMode: true },
  });
  const pw = popupWin;
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
    createTab({ url: u });
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------- commandes

const YES = /^(o|oui|y|yes)$/i;
const ANSWER = /^(o|oui|y|yes|n|non|no|t|toujours|j|jamais|a|always|x|never)?$/i;

// Met une question en file ; renvoie les lignes à afficher si c'est la seule en attente.
// accept : réponses valables (les autres comptent comme « non » et s'exécutent comme commande).
function enqueue(question, answer, accept = ANSWER) {
  prompts.push({ question, answer, accept });
  return prompts.length === 1 ? [{ t: `  ? ${question}`, c: 'warn' }] : [];
}

// Entrée vide répond oui, sauf pour une question irréversible (yes = false).
function confirm(question, run, yes = true) {
  return enqueue(`${question} ${yes ? t('(O/n)') : t('(o/N)')}`, async (input, say) => {
    if (YES.test(input) || (yes && !input)) await run(say);
    else say(t('  annulé'), 'dim');
  });
}

function ask(say, question, run, yes) {
  for (const l of confirm(question, run, yes)) say(l.t, l.c);
}

async function runCommand(line) {
  const lines = await exec(line);
  print([{ t: `❯ ${line}`, c: 'cmd' }, ...lines.lines]);
}

async function exec(raw, depth = 0) {
  const out = [];
  const say = (t, c = '') => out.push({ t, c });
  const result = { lines: out };
  const input = raw.trim();
  const tab = activeTab();

  if (prompts.length) {
    // Une réponse répond à la question ; une autre commande vaut « non » puis s'exécute.
    const isAnswer = prompts[0].accept.test(input);
    const p = prompts.shift();
    await p.answer(isAnswer ? input : 'non', say);
    if (prompts.length) say(`  ? ${prompts[0].question}`, 'warn');
    if (isAnswer) return result;
  }
  if (!input) return result;

  const line = C.expandAlias(input, settings.data.aliases);
  // La définition d'un alias garde ses « ; » : ils s'exécutent quand on lance l'alias.
  const parts = /^alias\s/i.test(line) ? [line] : C.splitCommands(line);
  if (parts.length > 1) {
    // Un alias peut enchaîner des commandes : « alias work = tab new gmail.com ; tab new github.com ».
    if (depth > 4) {
      say(t('  alias en boucle'), 'err');
      return result;
    }
    for (const part of parts) {
      const r = await exec(part, depth + 1);
      out.push(...r.lines);
      if (r.clear) result.clear = true;
      if (r.hideTerminal) result.hideTerminal = true;
    }
    return result;
  }
  const args = C.tokenize(line);
  const name = args.shift().toLowerCase();
  const rest = line.slice(line.indexOf(' ') + 1 || line.length).trim();

  try {
    // Un numéro ouvre l'élément correspondant de la dernière liste ; « 3t » dans un nouvel onglet.
    const num = name.match(/^(\d+)(t?)$/);
    if (num && !args.length) {
      await select(tab, Number(num[1]), num[2] === 't', say);
      return result;
    }
    // Une commande suivie de mots qu'elle n'attend pas (« home depot », « close friends »)
    // est une recherche, pas une erreur.
    if (args.length && !C.acceptsArgs(name, args)) {
      say(`  → brows ${input}`, 'dim');
      out.push(...(await runSearch(tab, input)));
      return result;
    }
    switch (name) {
      case 'help':
      case '?':
        setScreen(tab, { kind: 'help', commands: C.COMMANDS, shortcuts: SHORTCUTS });
        break;
      case 'clear':
        result.clear = true;
        break;
      case 'home':
      case 'accueil':
        showHome(tab);
        break;
      case 'brows':
      case 'search':
      case 's':
        if (!rest) throw new Error(t('que faut-il chercher ? brows <recherche>'));
        out.push(...(await runSearch(tab, rest)));
        break;
      case 'n':
      case 'next':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.next) throw new Error(t('pas de page suivante'));
        out.push(...(await runSearch(tab, tab.screen.query, tab.screen.next)));
        break;
      case 'p':
      case 'prev':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.prev) throw new Error(t('pas de page précédente'));
        setScreen(tab, tab.screen.prev, tab.screen.prev.results.map((r) => ({ kind: 'url', url: r.url })));
        break;
      case 'go':
      case 'open':
        if (!rest) throw new Error(t('quelle adresse ? go <url>'));
        navigate(tab, C.normalizeUrl(rest));
        break;
      case 'tty': {
        const arg = (args[0] || '').toLowerCase();
        const on = arg ? arg === 'on' : !tab.tty;
        tab.tty = on;
        if (on) {
          if (!tab.view || !tab.url) throw new Error(t('aucune page ouverte : « tty » affiche la page en texte'));
          await showTty(tab);
          say(t('  mode tty : la page en texte, liens numérotés (« tty off » pour revenir à la page)'), 'dim');
        } else {
          if (tab.screen && tab.screen.kind === 'tty') tab.screen = null;
          layout();
          sendState();
          say(t('  mode tty désactivé'), 'dim');
        }
        break;
      }
      case 'links':
      case 'l': {
        const count = await numberLinks(tab);
        say(t('  {count} liens numérotés, tape un numéro (« 3t » pour un nouvel onglet)', { count }), 'dim');
        break;
      }
      case 'back':
      case 'b':
        if (tab.screen && tab.view && tab.screen.kind !== 'tty') {
          if (tab.tty) showTty(tab);
          else {
            tab.screen = null;
            layout();
            sendState();
          }
        } else if (tab.view && tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
        else if (tab.view) showHome(tab);
        else throw new Error(t('rien avant'));
        break;
      case 'fwd':
      case 'f':
        if (!tab.view || !tab.view.webContents.navigationHistory.canGoForward()) throw new Error(t('rien après'));
        if (!tab.tty) tab.screen = null;
        tab.view.webContents.navigationHistory.goForward();
        layout();
        break;
      case 'reload':
      case 'r':
        reloadTab(tab);
        break;
      case 'tab':
      case 'tabs':
        if (!args.length) showTabs(tab);
        else if (args[0] === 'new') {
          const urls = args.slice(1);
          // Plusieurs adresses : un onglet pour chacune (groupe d'onglets) ; sinon une adresse ou une recherche.
          if (urls.length > 1 && urls.every((u) => C.looksLikeUrl(u))) for (const u of urls) createTab({ url: C.normalizeUrl(u) });
          else createTab({ url: urls.length ? C.normalizeUrl(urls.join(' ')) : undefined });
        } else if (args[0] === 'save') {
          const key = args[1];
          if (!key) throw new Error(t('tab save <nom>'));
          if (C.COMMAND_NAMES.includes(key)) throw new Error(t('« {name} » est déjà une commande', { name: key }));
          const urls = tabs.map((t) => t.url).filter((u) => u && /^https?:|^file:/.test(u));
          if (!urls.length) throw new Error(t('aucun onglet avec une page à enregistrer'));
          settings.data.aliases[key] = `tab new ${urls.join(' ')}`;
          settings.save();
          say(urls.length > 1 ? t('  ✓ alias {name} : rouvre {count} onglets', { name: key, count: urls.length }) : t('  ✓ alias {name} : rouvre 1 onglet', { name: key }), 'ok');
        } else {
          const t = tabs[Number(args[0]) - 1];
          if (!t) throw new Error(tr('pas d\'onglet numéro {n}', { n: args[0] }));
          showInPane(t, activePane);
        }
        break;
      case 'close': {
        const t = args.length ? tabs[Number(args[0]) - 1] : tab;
        if (!t) throw new Error(tr('pas d\'onglet numéro {n}', { n: args[0] }));
        closeTab(t);
        break;
      }
      case 'split':
        if (args[0] === 'off' || args[0] === 'close') {
          // Sans numéro, garde l'écran actif ; l'onglet de l'écran fermé reste ouvert.
          const n = args[1] ? Number(args[1]) : 2 - activePane;
          if (n !== 1 && n !== 2) throw new Error('split off [1|2]');
          closePane(n - 1);
        } else if (panes.length > 1) {
          say(t('  déjà en split : « focus » change d\'écran, « split off » ferme l\'autre écran (« split off 1|2 » pour choisir)'), 'dim');
        } else {
          panes.push({ tabId: null });
          const t = args.length
            ? createTab({ url: C.looksLikeUrl(rest) ? C.normalizeUrl(rest) : undefined, background: true })
            : createTab({ background: true });
          showInPane(t, 1);
          if (args.length && !C.looksLikeUrl(rest)) out.push(...(await runSearch(t, rest)));
        }
        break;
      case 'focus':
        if (panes.length === 1) throw new Error(t('pas de split en cours'));
        activePane = activePane === 0 ? 1 : 0;
        sendState();
        break;
      case 'fav':
        await favCommand(tab, args, say);
        break;
      case 'add': {
        if (!tab.view || !tab.url) throw new Error(t('aucune page ouverte à ajouter'));
        if (!args.length) throw new Error(t('il faut un nom : add [dossier/]nom'));
        const r = fav.addFavorite(favorites.data.tree, args.join(' '), tab.url, tab.view.webContents.getTitle());
        saveFavorites();
        if (r.createdFolders.length) say(t('  ✓ dossier {folder}/ créé', { folder: r.createdFolders.join('/') }), 'ok');
        say(r.updated ? t('  ✓ favori mis à jour : {path}', { path: r.path }) : t('  ✓ ajouté aux favoris : {path}', { path: r.path }), 'ok');
        sendState();
        break;
      }
      case 'undo':
        if (!lastUndo) throw new Error(t('rien à annuler'));
        fav.restoreFavorite(favorites.data.tree, lastUndo);
        saveFavorites();
        say(t('  ✓ {name} restauré', { name: lastUndo.node.name }), 'ok');
        lastUndo = null;
        break;
      case 'hist':
      case 'history':
        showHist(tab, rest);
        break;
      case 'clean':
        if (args[0] === 'all') {
          out.push(...confirm(t('vider historique, cookies et cache ? tu seras déconnecté des sites'), async (s) => {
            history.data.entries = [];
            history.save();
            await ses.clearStorageData({ storages: ['cookies'] });
            await ses.clearCache();
            s(t('  ✓ historique, cookies et cache vidés'), 'ok');
          }, false));
        } else {
          history.data.entries = [];
          history.save();
          say(t('  ✓ historique vidé'), 'ok');
          if (tab.screen && tab.screen.kind === 'hist') showHist(tab, '');
        }
        break;
      case 'find':
        if (!tab.view || tab.screen) throw new Error(t('aucune page ouverte'));
        if (!rest) {
          tab.view.webContents.stopFindInPage('clearSelection');
          tab.findText = '';
        } else {
          // Pour Electron, findNext: true ouvre une nouvelle recherche ; false passe au résultat suivant.
          tab.view.webContents.findInPage(rest, { findNext: tab.findText !== rest });
          tab.findText = rest;
        }
        break;
      case 'ext':
        await extCommand(tab, args, say);
        break;
      case 'dl':
        if (!args.length) showDl(tab);
        else await select(tab, Number(args[0]), false, say, 'dl');
        break;
      case 'alias':
        aliasCommand(tab, line.slice(5).trim(), say);
        break;
      case 'unalias':
        if (!args[0] || !settings.data.aliases[args[0]]) throw new Error(t('pas d\'alias « {name} »', { name: args[0] || '' }));
        delete settings.data.aliases[args[0]];
        settings.save();
        say(t('  ✓ alias {name} supprimé', { name: args[0] }), 'ok');
        break;
      case 'adblock':
      case 'pub':
        await adblockCommand(args[0], say);
        break;
      case 'engine':
        if (!args.length) say(t('  moteur : {engine} (ddg | google | bing | qwant)', { engine: C.ENGINES[settings.data.engine].label }));
        else {
          if (!C.ENGINES[args[0]]) throw new Error(t('moteurs : ddg, google, bing, qwant'));
          settings.data.engine = args[0];
          settings.save();
          say(t('  ✓ moteur : {engine}', { engine: C.ENGINES[args[0]].label }) + (args[0] === 'ddg' ? '' : t(' (résultats affichés sur sa page, « links » pour numéroter)')), 'ok');
        }
        break;
      case 'theme':
        if (!args.length) say(t('  thèmes : {themes} (actuel : {theme})', { themes: Object.keys(THEMES).join(', '), theme: settings.data.theme }));
        else {
          if (!THEMES[args[0]]) throw new Error(t('thèmes : {themes}', { themes: Object.keys(THEMES).join(', ') }));
          settings.data.theme = args[0];
          settings.save();
          sendState();
        }
        break;
      case 'perm':
        permCommand(args, say);
        break;
      case 'lang':
      case 'langue':
        langCommand(args[0], say);
        break;
      case 'ia':
      case 'ai':
        aiCommand(tab, args, rest, say);
        break;
      case 'update':
        await updateCommand(args, say);
        break;
      case 'devtools':
      case 'dev':
        if (args[0] === 'detach' || args[0] === 'detacher') {
          if (!tab.devOpen) openDevtools(tab);
          detachDevtools(tab);
        } else if (args[0] === 'attach' || args[0] === 'rattacher') attachDevtools(tab);
        else if (args[0] === 'close' || args[0] === 'off') closeDevtools(tab);
        else toggleDevtools(tab);
        break;
      case 'term':
        result.hideTerminal = true;
        break;
      case 'fullscreen':
      case 'fs':
        win.setFullScreen(args[0] === 'off' ? false : args[0] === 'on' ? true : !win.isFullScreen());
        say(win.isFullScreen() ? t('  plein écran (F11 ou « fullscreen » pour en sortir)') : t('  plein écran quitté'), 'dim');
        break;
      case 'quit':
      case 'exit':
      case 'q':
        setTimeout(() => app.quit(), 50);
        break;
      default:
        if (C.looksLikeUrl(input)) navigate(tab, C.normalizeUrl(input));
        else {
          say(`  → brows ${input}`, 'dim');
          out.push(...(await runSearch(tab, input)));
        }
    }
  } catch (err) {
    say(`  ${err.message}`, 'err');
  }
  return result;
}

async function select(tab, n, newTab, say, onlyKind) {
  const item = tab.numbered[n - 1];
  if (!item || (onlyKind && item.kind !== onlyKind)) {
    if (onlyKind === 'dl' && downloads[n - 1]) return select({ numbered: downloads.map((d) => ({ kind: 'dl', path: d.path })) }, n, newTab, say);
    throw new Error(tab.numbered.length ? t('pas de numéro {n} ici (1 à {max})', { n, max: tab.numbered.length }) : t('aucune liste numérotée ici (essaie « links »)'));
  }
  switch (item.kind) {
    case 'url':
      if (newTab) createTab({ url: item.url, background: true });
      else navigate(tab, item.url);
      break;
    case 'search':
      for (const l of await runSearch(tab, item.query)) say(l.t, l.c);
      break;
    case 'link':
      if (newTab && item.href) createTab({ url: item.href, background: true });
      else if (!(await clickLink(tab, item.i))) throw new Error(t('ce lien n\'existe plus, relance « links »'));
      tab.numbered = [];
      break;
    case 'tab': {
      const t = getTab(item.id);
      if (!t) throw new Error(tr('onglet fermé'));
      showInPane(t, activePane);
      break;
    }
    case 'aiuse':
      aiUse(tab, item.provider, say);
      break;
    case 'ext':
      openExtPopup(item.n);
      break;
    case 'dl':
      if (!item.path) throw new Error(t('fichier pas encore enregistré'));
      if (newTab) shell.showItemInFolder(item.path);
      else {
        const err = await shell.openPath(item.path);
        if (err) throw new Error(err);
      }
      break;
    default:
  }
  if (newTab) say(t('  ouvert dans un nouvel onglet'), 'dim');
}

function favPathArg(tab, arg) {
  // Accepte un chemin ou le numéro affiché dans « fav ».
  if (/^\d+$/.test(arg) && tab.numberedKind === 'fav') {
    const item = tab.numbered[Number(arg) - 1];
    if (item) return item.path;
  }
  return arg;
}

// ---------------------------------------------------------------- import des favoris

// Navigateurs connus : dossier des profils selon le système (Chromium : un fichier Bookmarks par profil).
const BROWSERS = [
  { id: 'chrome', name: 'Chrome', kind: 'chromium', win: ['local', 'Google/Chrome/User Data'], mac: 'Google/Chrome', linux: 'google-chrome' },
  { id: 'edge', name: 'Edge', kind: 'chromium', win: ['local', 'Microsoft/Edge/User Data'], mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  { id: 'brave', name: 'Brave', kind: 'chromium', win: ['local', 'BraveSoftware/Brave-Browser/User Data'], mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser' },
  { id: 'vivaldi', name: 'Vivaldi', kind: 'chromium', win: ['local', 'Vivaldi/User Data'], mac: 'Vivaldi', linux: 'vivaldi' },
  { id: 'opera', name: 'Opera', kind: 'chromium', win: ['roaming', 'Opera Software/Opera Stable'], mac: 'com.operasoftware.Opera', linux: 'opera' },
  { id: 'chromium', name: 'Chromium', kind: 'chromium', win: ['local', 'Chromium/User Data'], mac: 'Chromium', linux: 'chromium' },
  { id: 'firefox', name: 'Firefox', kind: 'firefox', win: ['roaming', 'Mozilla/Firefox/Profiles'], mac: 'Firefox/Profiles', linux: '../.mozilla/firefox' },
];

function browserDirs(b) {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const base = b.win[0] === 'local' ? process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local') : process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(base, b.win[1])];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', b.mac)];
  const dirs = [path.join(home, '.config', b.linux)];
  if (b.id === 'firefox') dirs.push(path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'));
  return dirs;
}

const readDir = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

// Liste les profils trouvés sur cet ordinateur : { id, label, kind, file }.
function browserSources() {
  const out = [];
  for (const b of BROWSERS) {
    for (const dir of browserDirs(b)) {
      if (b.kind === 'chromium') {
        let names = {};
        try {
          names = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8')).profile.info_cache || {};
        } catch {}
        const profiles = [{ dir, profile: '' }, ...readDir(dir).filter((d) => d.isDirectory()).map((d) => ({ dir: path.join(dir, d.name), profile: d.name }))];
        for (const p of profiles) {
          const file = path.join(p.dir, 'Bookmarks');
          if (!fs.existsSync(file)) continue;
          const who = p.profile && ((names[p.profile] && names[p.profile].name) || p.profile);
          out.push({ id: b.id, name: b.name, label: who ? `${b.name} (${who})` : b.name, kind: 'chromium', file });
        }
      } else {
        for (const d of readDir(dir).filter((x) => x.isDirectory())) {
          const backups = path.join(dir, d.name, 'bookmarkbackups');
          const files = readDir(backups).filter((f) => /\.jsonlz4$/.test(f.name)).map((f) => path.join(backups, f.name));
          if (!files.length) continue;
          const file = files.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
          const who = d.name.replace(/^[^.]*\./, '');
          out.push({ id: b.id, name: b.name, label: `${b.name} (${who})`, kind: 'firefox', file });
        }
      }
    }
  }
  return out;
}

function readBookmarks(source) {
  const file = source.file;
  if (source.kind === 'chromium' || /\.json$/i.test(file)) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return json.roots ? bookmarks.fromChromium(json) : bookmarks.fromFirefox(json);
  }
  if (source.kind === 'firefox' || /\.jsonlz4$/i.test(file)) return bookmarks.fromFirefox(JSON.parse(bookmarks.mozLz4(fs.readFileSync(file)).toString('utf8')));
  return bookmarks.fromHtml(fs.readFileSync(file, 'utf8'));
}

function importFrom(tab, source, say) {
  let nodes;
  try {
    nodes = readBookmarks(source);
  } catch (err) {
    throw new Error(t('impossible de lire les favoris de {name} : {error}', { name: source.label, error: err.message }));
  }
  const folder = source.name;
  const r = bookmarks.mergeInto(favorites.data.tree, folder, nodes);
  if (!r.added) return say(t('  rien de nouveau dans {name} ({skipped} déjà dans tes favoris)', { name: source.label, skipped: r.skipped }), 'dim');
  saveFavorites();
  const done = r.added === 1 ? t('  ✓ 1 favori importé de {name} dans {folder}/', { name: source.label, folder }) : t('  ✓ {count} favoris importés de {name} dans {folder}/', { count: r.added, name: source.label, folder });
  say(done + (r.skipped ? t(' ({skipped} déjà là)', { skipped: r.skipped }) : ''), 'ok');
  showFav(tab, folder);
}

// fav import : choisir un navigateur trouvé ; fav import chrome ; fav import <fichier.html> ; fav import fichier.
async function importCommand(tab, arg, say) {
  const file = arg.replace(/^~(?=$|[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1');
  if (/^(fichier|file)$/i.test(arg)) {
    const r = await dialog.showOpenDialog(win, {
      title: t('Favoris exportés d\'un autre navigateur'),
      properties: ['openFile'],
      filters: [{ name: t('Favoris'), extensions: ['html', 'htm', 'json', 'jsonlz4'] }],
    });
    if (r.canceled || !r.filePaths.length) return say(t('  annulé'), 'dim');
    return importFrom(tab, { label: path.basename(r.filePaths[0]), name: t('importés'), kind: 'file', file: r.filePaths[0] }, say);
  }
  if (file && /[\\/.]/.test(file)) {
    if (!fs.existsSync(file)) throw new Error(t('fichier introuvable : {file}', { file }));
    return importFrom(tab, { label: path.basename(file), name: t('importés'), kind: 'file', file }, say);
  }
  let sources = browserSources();
  if (arg) {
    sources = sources.filter((x) => x.id === arg.toLowerCase());
    if (!sources.length) throw new Error(t('pas de favoris {name} trouvés sur cet ordinateur (« fav import » pour la liste)', { name: arg }));
  }
  if (sources.length === 1) return importFrom(tab, sources[0], say);
  if (!sources.length) {
    say(t('  aucun navigateur trouvé sur cet ordinateur'), 'dim');
    return say(t('  exporte tes favoris en HTML depuis l\'autre navigateur, puis « fav import fichier »'), 'dim');
  }
  say(t('  favoris trouvés sur cet ordinateur :'), 'dim');
  sources.forEach((x, i) => say(`  [${i + 1}] ${x.label}`));
  say(t('  ou « fav import fichier » pour un export HTML'), 'dim');
  const question = t('importer lesquels ? numéro (1-{max}), ou Entrée pour annuler', { max: sources.length });
  for (const l of enqueue(question, async (input, s) => {
    const x = sources[Number(input) - 1];
    if (!input || !x) return s(t('  annulé'), 'dim');
    importFrom(tab, x, s);
  }, /^\d*$/)) say(l.t, l.c);
}

async function favCommand(tab, args, say) {
  const tree = favorites.data.tree;
  const sub = args[0];
  if (sub === 'rm' || sub === 'del') {
    if (!args[1]) throw new Error(t('fav rm <chemin | n>'));
    const target = favPathArg(tab, args.slice(1).join(' '));
    const node = fav.getNode(tree, target);
    if (!node) throw new Error(t('favori introuvable : {path}', { path: target }));
    const question = node.type === 'folder' ? t('supprimer le dossier {path}/ et son contenu ?', { path: target }) : t('supprimer {path} ?', { path: target });
    ask(say, question, async (s) => {
      lastUndo = fav.removeFavorite(tree, target);
      saveFavorites();
      s(t('  ✓ supprimé (undo pour annuler)'), 'ok');
      sendState();
    });
    return;
  }
  if (sub === 'import') return importCommand(tab, args.slice(1).join(' '), say);
  if (sub === 'mv') {
    if (args.length < 3) throw new Error(t('fav mv <chemin> <destination>'));
    const node = fav.moveFavorite(tree, favPathArg(tab, args[1]), args[2]);
    saveFavorites();
    say(t('  ✓ {name} déplacé vers {dest}', { name: node.name, dest: args[2] }), 'ok');
  } else if (sub === 'rename') {
    if (args.length < 3) throw new Error(t('fav rename <chemin> <nouveau nom>'));
    fav.renameFavorite(tree, favPathArg(tab, args[1]), args[2]);
    saveFavorites();
    say(t('  ✓ renommé en {name}', { name: args[2] }), 'ok');
  }
  const folder = !sub || ['mv', 'rename'].includes(sub) ? (tab.screen && tab.screen.kind === 'fav' ? tab.screen.folder : '') : args.join(' ');
  showFav(tab, folder);
}

async function extCommand(tab, args, say) {
  const sub = args[0];
  const n = Number(args[1]);
  if (!sub) {
    showExt(tab);
    return;
  }
  if (/^\d+$/.test(sub)) {
    openExtPopup(Number(sub));
    return;
  }
  switch (sub) {
    case 'add': {
      // Sans argument, installe l'extension de la page du Chrome Web Store ouverte.
      const source = args[1] ? args.slice(1).join(' ') : storeExtensionId(tab.url || '');
      if (!source) throw new Error(t('ext add <lien du Chrome Web Store | identifiant | dossier | ublock>, ou « ext add » seul sur la page de l\'extension'));
      print([{ t: t('  installation de l\'extension…'), c: 'dim' }]);
      const ext = await exts.add(source);
      say(t('  ✓ {name} installée, alias « {alias} »', { name: ext.name, alias: ext.alias }) + (ext.popup ? '' : t(' (pas de popup)')), 'ok');
      if (ext.dnrOnly) say(t('  ⚠ cette extension bloque avec declarativeNetRequest, qu\'Electron ne gère pas : elle ne bloquera rien. Pour bloquer les pubs : uBlock Origin (« ext add ublock »).'), 'warn');
      if (/ublock origin/i.test(ext.name || '') && adblock.on) {
        // Electron n'accepte qu'un filtre de requêtes : le bloqueur intégré empêcherait uBlock de filtrer.
        await adblockCommand('off', say);
      }
      break;
    }
    case 'on':
    case 'off': {
      const ext = await exts.setEnabled(n, sub === 'on');
      say(sub === 'on' ? t('  ✓ {alias} activée', { alias: ext.alias }) : t('  ✓ {alias} désactivée', { alias: ext.alias }), 'ok');
      break;
    }
    case 'rm': {
      const ext = exts.get(n);
      ask(say, t('désinstaller {name} ?', { name: ext.name }), async (s) => {
        exts.remove(n);
        s(t('  ✓ extension désinstallée'), 'ok');
        if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
        sendState();
      });
      return;
    }
    case 'log':
      extLogCommand(args.slice(1).join(' '), say);
      break;
    case 'alias':
      exts.rename(n, args[2]);
      say(t('  ✓ alias : {alias}', { alias: args[2] }), 'ok');
      break;
    default:
      throw new Error('ext [add | on | off | rm | alias | n]');
  }
  if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
  sendState();
}

async function adblockCommand(arg, say) {
  if (arg === 'on') {
    settings.data.builtinAdblock = true;
    settings.save();
    say(t('  chargement des listes de blocage…'), 'dim');
    try {
      await adblock.enable();
    } catch (err) {
      throw new Error(t('listes non téléchargées : {error}', { error: err.message }));
    }
  } else if (arg === 'off') {
    settings.data.builtinAdblock = false;
    settings.save();
    adblock.disable();
  } else if (arg) throw new Error('adblock [on | off]');
  if (adblock.on) say(adblock.blocked > 1 ? t('  ✓ bloqueur de pub intégré actif : {count} requêtes bloquées depuis le démarrage', { count: adblock.blocked }) : t('  ✓ bloqueur de pub intégré actif : {count} requête bloquée depuis le démarrage', { count: adblock.blocked }), 'ok');
  if (adblock.on) say(t('  ⚠ tant qu\'il est actif, uBlock Origin et les autres extensions de blocage ne filtrent plus les requêtes'), 'warn');
  else say(t('  bloqueur de pub intégré éteint : uBlock Origin s\'occupe des pubs (« adblock on » pour le bloqueur de secours)'), 'dim');
  sendState();
}

function aliasCommand(tab, text, say) {
  const aliases = settings.data.aliases;
  if (!text) {
    setScreen(tab, { kind: 'alias', rows: Object.entries(aliases).map(([k, v]) => ({ name: k, value: v })) });
    return;
  }
  const m = text.match(/^(\S+)\s*(?:=\s*)?(.*)$/);
  const key = m[1];
  const value = m[2].trim();
  if (!value) {
    if (!aliases[key]) throw new Error(t('pas d\'alias « {name} »', { name: key }));
    say(`  ${key} = ${aliases[key]}`);
    return;
  }
  if (C.COMMAND_NAMES.includes(key)) throw new Error(t('« {name} » est déjà une commande', { name: key }));
  aliases[key] = value;
  settings.save();
  say(`  ✓ alias ${key} = ${value}`, 'ok');
}

// ---------------------------------------------------------------- langue

// Réglage enregistré, sinon langue choisie dans l'installateur Windows, sinon celle du système.
function initialLang() {
  if (settings.data.lang === 'fr' || settings.data.lang === 'en') return settings.data.lang;
  if (app.isPackaged) {
    try {
      const v = fs.readFileSync(path.join(process.resourcesPath, 'default-lang'), 'utf8').trim();
      if (v === 'fr' || v === 'en') {
        // Gardée dans les réglages : une mise à jour silencieuse réinstalle sans ce choix.
        settings.data.lang = v;
        settings.save();
        return v;
      }
    } catch {
      // pas de fichier : installé autrement qu'avec l'installateur Windows
    }
  }
  return /^fr/i.test(app.getLocale()) ? 'fr' : 'en';
}

function langCommand(arg, say) {
  const lang = (arg || '').toLowerCase();
  if (!lang) {
    say(t('  langue : français (lang fr | en)'));
    return;
  }
  if (lang !== 'fr' && lang !== 'en') throw new Error('lang fr | en');
  settings.data.lang = lang;
  settings.save();
  setLang(lang);
  buildMenu();
  for (const tab of tabs) if (tab.screen && tab.screen.kind === 'home') showHome(tab);
  say(t('  ✓ langue : français'), 'ok');
  sendState();
}

// ---------------------------------------------------------------- IA

let aiRequest = 0;

function aiProvidersScreen(tab) {
  const rows = ai.list(settings).map((r, i) => ({ n: i + 1, ...r }));
  setScreen(tab, { kind: 'aiproviders', rows }, rows.map((r) => ({ kind: 'aiuse', provider: r.id })));
}

// Choisit une IA ; sans clé, ouvre la page où la créer.
function aiUse(tab, id, say) {
  const p = ai.PROVIDERS[id];
  ai.use(settings, id);
  say(t('  ✓ ia : {name} · modèle {model}', { name: t(p.name), model: ai.model(settings, id) }), 'ok');
  if (!p.noKey && !ai.readKey(settings, id)) {
    say(p.free ? t('  il faut une clé (gratuite) : crée-la sur la page ouverte, puis tape « ia key <clé> »') : t('  il faut une clé : crée-la sur la page ouverte, puis tape « ia key <clé> »'), 'warn');
    createTab({ url: p.keyUrl });
  } else if (id === 'ollama') {
    say(t('  Ollama doit tourner sur cet ordinateur avec le modèle installé (« ollama pull {model} »)', { model: ai.model(settings, id) }), 'dim');
  }
  if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
}

function aiCommand(tab, args, rest, say) {
  const sub = (args[0] || '').toLowerCase();
  const target = ai.resolve(args[1]);
  if (!rest) {
    aiProvidersScreen(tab);
    return;
  }
  if (sub === 'key' || (sub === 'connect' && target)) {
    const id = sub === 'key' ? ai.current(settings) : target;
    const key = sub === 'key' ? args[1] : args[2];
    if (sub === 'connect') ai.use(settings, id);
    if (!key) {
      if (sub === 'connect') aiUse(tab, id, say);
      else say(t('  ia key <clé de {name}>', { name: ai.PROVIDERS[id].name }), 'err');
      return;
    }
    const encrypted = ai.saveKey(settings, id, key);
    say(t('  ✓ clé {name} enregistrée', { name: ai.PROVIDERS[id].name }) + (encrypted ? t(' (chiffrée par le système)') : t(' (le système ne permet pas de la chiffrer)')), 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'use' && args.length === 2) {
    if (!target) throw new Error(t('IA inconnue : {name} ({list})', { name: args[1], list: Object.keys(ai.PROVIDERS).join(', ') }));
    aiUse(tab, target, say);
    return;
  }
  if (sub === 'logout' && args.length <= 2) {
    const id = args[1] ? target : ai.current(settings);
    if (!id) throw new Error(t('IA inconnue : {name}', { name: args[1] }));
    say(ai.removeKey(settings, id) ? t('  ✓ clé {name} supprimée', { name: ai.PROVIDERS[id].name }) : t('  pas de clé enregistrée pour {name}', { name: ai.PROVIDERS[id].name }), 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'model' && args.length <= 2) {
    const id = ai.current(settings);
    if (args[1]) ai.setModel(settings, id, args[1] === 'default' ? null : args[1]);
    say(t('  modèle {name} : {model}', { name: ai.PROVIDERS[id].name, model: ai.model(settings, id) }));
    return;
  }
  const id = ++aiRequest;
  const provider = ai.current(settings);
  const screen = { kind: 'ai', id, provider: ai.PROVIDERS[provider].name, question: rest, text: '', sources: [], done: false, error: null };
  setScreen(tab, screen, []);
  let timer = null;
  // Le texte arrive en continu : on rafraîchit l'écran au plus toutes les 80 ms.
  const refresh = (final) => {
    if (tab.screen !== screen) return; // la personne est passée à autre chose
    clearTimeout(timer);
    if (final) setScreen(tab, screen, screen.sources.map((src) => ({ kind: 'url', url: src.url })));
    else timer = setTimeout(() => sendState(), 80);
  };
  ai.ask(settings, rest, (text) => {
    screen.text = text;
    refresh(false);
  }).then((r) => {
    screen.text = r.text || (r.refused ? '' : t('(pas de réponse)'));
    screen.sources = r.sources.map((src, i) => ({ n: i + 1, ...src, short: shortUrl(src.url) }));
    if (r.refused) screen.error = t('{name} a refusé de répondre à cette question.', { name: screen.provider });
    if (r.switched) say(t('  le modèle {from} a été retiré : {name} utilise maintenant {to}', { from: r.switched.from, name: screen.provider, to: r.switched.to }));
    screen.done = true;
    refresh(true);
  }).catch((err) => {
    screen.error = ai.errorMessage(err, provider);
    screen.done = true;
    refresh(true);
    if (id === aiRequest) print([{ t: `  ${screen.error}`, c: 'err' }]);
  });
}

// ---------------------------------------------------------------- mises à jour

// Réglage enregistré, sinon case de l'installateur Windows, sinon activé.
function autoUpdateOn() {
  if (typeof settings.data.autoUpdate === 'boolean') return settings.data.autoUpdate;
  let on = true;
  if (app.isPackaged) {
    try {
      on = fs.readFileSync(path.join(process.resourcesPath, 'default-autoupdate'), 'utf8').trim() !== 'off';
      // Gardé dans les réglages : une mise à jour silencieuse réinstalle sans cette page.
      settings.data.autoUpdate = on;
      settings.save();
    } catch {
      // pas de fichier : installé autrement qu'avec l'installateur Windows
    }
  }
  return on;
}

async function updateCommand(args, say) {
  const sub = args[0];
  if (sub === 'auto') {
    const arg = (args[1] || '').toLowerCase();
    if (arg && arg !== 'on' && arg !== 'off') throw new Error('update auto [on | off]');
    if (arg) {
      settings.data.autoUpdate = arg === 'on';
      settings.save();
    }
    const state = autoUpdateOn()
      ? t('vérification automatique au lancement : activée (dev-brows et extensions)')
      : t('vérification automatique au lancement : désactivée (« update » et « ext » restent possibles à la main)');
    say(`  ${arg ? '✓ ' : ''}${state}`, arg ? 'ok' : '');
    return;
  }
  if (sub === '-v' || sub === 'versions') {
    await versionsCommand(args[1], say);
    return;
  }
  if (updater.installed()) {
    if (sub === 'electron') {
      say(t('  Electron est inclus dans l\'installateur : « update install » installe la dernière version publiée'), 'dim');
      return;
    }
    if (sub === 'install') {
      // Sans signature Apple, macOS refuse l'installation automatique : on ouvre la page de téléchargement.
      if (process.platform === 'darwin') {
        createTab({ url: updater.RELEASES_URL });
        say(t('  page des installateurs ouverte : télécharge le .dmg de la dernière version'), 'dim');
        return;
      }
      ask(say, t('télécharger et installer la dernière version ? l\'appli redémarrera'), async (s) => {
        print([{ t: t('  téléchargement de l\'installateur…'), c: 'dim' }]);
        let last = -10;
        try {
          const started = await updater.installRelease((pct) => {
            if (pct - last >= 10 || pct === 100) {
              last = pct;
              print([{ t: `  ↓ ${pct} %`, c: 'dim' }]);
            }
          });
          if (!started) s(t('  ✓ déjà à jour'), 'ok');
        } catch (err) {
          s(t('  mise à jour impossible : {error}', { error: err.message }), 'err');
          createTab({ url: updater.RELEASES_URL });
          s(t('  page des installateurs ouverte pour la faire à la main'), 'dim');
        }
      });
      return;
    }
  } else if (sub === 'install' || sub === 'electron') {
    const what = sub === 'electron'
      ? t('passer à la dernière version majeure d\'Electron (peut casser des choses, à tester) ? l\'appli va se fermer puis se relancer')
      : t('mettre à jour l\'appli et Electron dans sa version actuelle ? l\'appli va se fermer puis se relancer');
    ask(say, what, async (s) => {
      await updater.launchSource(sub === 'electron' ? 'electron' : 'app');
      s(t('  mise à jour lancée, l\'appli redémarre…'), 'ok');
      setTimeout(() => app.quit(), 600);
    });
    return;
  }
  say(t('  vérification…'), 'dim');
  const r = await updater.check();
  settings.data.lastUpdateCheck = Date.now();
  settings.save();
  for (const l of updateLines(r)) say(l.t, l.c);
  await updateRecap(r, say);
}

// Récapitulatif de ce qu'apporte la mise à jour proposée : notes de chaque version publiée
// depuis celle installée, ou titres des commits en attente quand l'appli tourne depuis le code.
async function updateRecap(r, say) {
  if (!r.installed) {
    if (!r.commits || !r.commits.length) return;
    say(t('  au programme :'), 'dim');
    for (const c of r.commits) say(`  · ${c}`);
    if (r.behind > r.commits.length) say(t('  · … et {count} autres', { count: r.behind - r.commits.length }), 'dim');
    return;
  }
  if (!r.available) return;
  let releases = [];
  try {
    releases = await updater.listReleases();
  } catch {
    return; // la vérification a marché, seules les notes manquent
  }
  const lang = getLang();
  const wanted = releases.filter((x) => newer(x.version, r.current) && !newer(x.version, r.latest));
  if (!wanted.length) return;
  say(t('  au programme :'), 'dim');
  for (const x of wanted) {
    say(`  dev-brows ${x.version}`, 'ok');
    const notes = exactNotes(x.version, lang) || releaseNotes(x.body, lang);
    if (notes.length) for (const n of notes) say(`  · ${n}`);
    else say(t('  pas de notes pour cette version'), 'dim');
  }
}

// « update -v » : liste les versions publiées ; un numéro affiche les notes de cette version
// puis propose de l'installer (plus récente ou plus ancienne).
async function versionsCommand(wanted, say) {
  const releases = await updater.listReleases();
  if (!releases.length) throw new Error(t('aucune version publiée sur GitHub'));
  const current = app.getVersion();
  if (wanted) {
    const r = releases.find((x) => x.version === wanted.replace(/^v/, ''));
    if (!r) throw new Error(t('pas de version {version} publiée (« update -v » pour la liste)', { version: wanted }));
    return showVersion(r, say);
  }
  say(t('  versions publiées (installée : {version})', { version: current }), 'dim');
  releases.forEach((r, i) => {
    const date = r.date ? new Date(r.date).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'fr-FR') : '';
    const mark = r.version === current ? t('  ← installée') : '';
    say(`  [${i + 1}] ${r.version}  ${date}${mark}`, r.version === current ? 'ok' : '');
  });
  const question = t('quelle version ? numéro (1-{max}), ou Entrée pour annuler', { max: releases.length });
  for (const l of enqueue(question, async (input, s) => {
    const r = releases[Number(input) - 1];
    if (!input || !r) return s(t('  annulé'), 'dim');
    await showVersion(r, s);
  }, /^\d*$/)) say(l.t, l.c);
}

async function showVersion(r, say) {
  const lang = getLang();
  const notes = exactNotes(r.version, lang) || releaseNotes(r.body, lang);
  say(`  dev-brows ${r.version}`, 'ok');
  if (notes.length) for (const n of notes) say(`  · ${n}`);
  else say(t('  pas de notes pour cette version'), 'dim');
  const current = app.getVersion();
  if (r.version === current) return say(t('  c\'est la version installée'), 'dim');
  if (!updater.installed()) return say(t('  appli lancée depuis le code : « update install » suit le dépôt, pas les versions publiées'), 'dim');
  if (process.platform === 'darwin') {
    createTab({ url: r.url });
    return say(t('  page de la version ouverte : télécharge son .dmg'), 'dim');
  }
  const older = newer(current, r.version);
  const question = older
    ? t('installer la version {version}, plus ancienne que la tienne ({current}) ? l\'appli redémarrera', { version: r.version, current })
    : t('installer la version {version} ? l\'appli redémarrera', { version: r.version });
  ask(say, question, async (s) => {
    print([{ t: t('  téléchargement de l\'installateur…'), c: 'dim' }]);
    let last = -10;
    try {
      const started = await updater.installVersion(r.version, (pct) => {
        if (pct - last >= 10 || pct === 100) {
          last = pct;
          print([{ t: `  ↓ ${pct} %`, c: 'dim' }]);
        }
      });
      if (!started) s(t('  rien à installer pour cette version'), 'dim');
    } catch (err) {
      s(t('  installation impossible : {error}', { error: err.message }), 'err');
      createTab({ url: r.url });
      s(t('  page de la version ouverte pour l\'installer à la main'), 'dim');
    }
  });
}

function updateLines(r) {
  if (r.installed) {
    const lines = [{ t: `  dev-brows ${r.current} (Electron ${process.versions.electron}, Chromium ${process.versions.chrome})` }];
    if (r.available) lines.push({ t: t('  ↑ nouvelle version publiée sur GitHub : {version} → « update install »', { version: r.latest }), c: 'warn' });
    else lines.push({ t: t('  ✓ à jour'), c: 'ok' });
    return lines;
  }
  const lines = [{ t: t('  Electron {electron} (Chromium {chrome}), lancé depuis le code', { electron: r.current, chrome: process.versions.chrome }) }];
  const patch = r.sameMajor !== r.current;
  if (patch) lines.push({ t: t('  ↑ correctifs disponibles : Electron {version} → « update install »', { version: r.sameMajor }), c: 'warn' });
  if (updater.major(r.latest) > updater.major(r.current)) {
    lines.push({ t: t('  ↑ nouvelle version majeure : Electron {version} → « update electron » (à tester)', { version: r.latest }), c: 'dim' });
  }
  if (r.behind) lines.push({ t: r.behind > 1 ? t('  ↑ {count} nouveaux commits sur le dépôt → « update install »', { count: r.behind }) : t('  ↑ 1 nouveau commit sur le dépôt → « update install »'), c: 'warn' });
  if (!patch && !r.behind) lines.push({ t: t('  ✓ à jour'), c: 'ok' });
  return lines;
}

// Au démarrage : compte rendu de la dernière mise à jour, puis vérification de l'appli
// et mise à jour des extensions, à chaque lancement.
function startupUpdateNotes() {
  const report = updater.lastReport();
  if (report) {
    const versions = report.before !== report.after ? ` (Electron ${report.before} → ${report.after})` : '';
    print([{ t: `  ${report.ok ? t('✓ mise à jour terminée') : t('✗ mise à jour incomplète')}${versions}`, c: report.ok ? 'ok' : 'err' }]);
    for (const step of report.steps.filter((st) => !st.ok)) print([{ t: `    ${step.cmd} : ${step.output}`, c: 'err' }]);
  }
  if (updater.installed() && settings.data.lastVersion && settings.data.lastVersion !== app.getVersion()) {
    print([{ t: t('  ✓ dev-brows mis à jour en {version}', { version: app.getVersion() }), c: 'ok' }]);
  }
  settings.data.lastVersion = app.getVersion();
  settings.save();
  // « update auto off » : ni vérification de l'appli ni mise à jour des extensions au lancement.
  if (!autoUpdateOn()) return;
  setTimeout(async () => {
    try {
      const r = await updater.check();
      settings.data.lastUpdateCheck = Date.now();
      settings.save();
      print(updateLines(r).filter((l) => l.c === 'warn'));
    } catch {
      // hors ligne : on réessaiera au prochain démarrage
    }
    const results = await exts.updateAll();
    for (const u of results.filter((x) => !x.error)) print([{ t: t('  ✓ extension {name} mise à jour : {from} → {to}', u), c: 'ok' }]);
    const failed = results.filter((x) => x.error);
    if (failed.length) print([{ t: t('  mise à jour impossible pour {names} ({error})', { names: failed.map((x) => x.name).join(', '), error: failed[0].error }), c: 'dim' }]);
    sendState();
  }, 8000);
}

// ---------------------------------------------------------------- clés de sécurité (WebAuthn)

// Une clé (YubiKey…) qui garde plusieurs comptes pour un site : on demande lequel dans le
// terminal. Sans ce choix, Electron annule la connexion.
function setupWebAuthn() {
  ses.on('select-webauthn-account', (e, details, callback) => {
    const accounts = details.accounts || [];
    if (accounts.length <= 1) return callback(accounts[0] && accounts[0].credentialId);
    const label = (a) => [a.displayName, a.name].filter(Boolean).join(' · ') || a.credentialId.slice(0, 12);
    const lines = enqueue(t('{site} : quel compte de la clé utiliser ? {list} (1-{max})', { site: details.relyingPartyId, list: accounts.map((a, i) => `${i + 1} = ${label(a)}`).join(', '), max: accounts.length }), async (input, say) => {
      const a = accounts[(input ? Number(input) : 1) - 1];
      callback(a ? a.credentialId : undefined);
      say(a ? t('  ✓ compte {name}', { name: label(a) }) : t('  connexion annulée'), a ? 'ok' : 'dim');
    }, /^\d*$/);
    if (lines.length) {
      print(lines);
      focusTerminal();
    }
  });
}

// ---------------------------------------------------------------- autorisations des sites

// Sans réglage, Electron accorde tout (caméra, micro, position…) sans demander.
// Ici, chaque demande passe par une question dans le terminal.
const SAFE_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write', 'mediaKeySystem']);

const PERMISSION_LABELS = {
  camera: mark('la caméra'),
  microphone: mark('le micro'),
  geolocation: mark('ta position'),
  notifications: mark('les notifications'),
  'clipboard-read': mark('la lecture du presse-papier'),
  'display-capture': mark('le partage d\'écran'),
  midi: mark('les appareils MIDI'),
  midiSysex: mark('les appareils MIDI'),
  openExternal: mark('l\'ouverture d\'une application externe'),
  'idle-detection': mark('la détection d\'inactivité'),
  'storage-access': mark('ses cookies sur d\'autres sites'),
  'top-level-storage-access': mark('ses cookies sur d\'autres sites'),
  'window-management': mark('la gestion des fenêtres et écrans'),
  'speaker-selection': mark('le choix de la sortie audio'),
};

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url || t('ce site');
  }
}

// Une demande « media » couvre la caméra et/ou le micro.
function permissionKeys(permission, details) {
  if (permission !== 'media') return [permission];
  const types = details.mediaTypes && details.mediaTypes.length ? details.mediaTypes : ['audio', 'video'];
  return types.map((t) => (t === 'video' ? 'camera' : 'microphone'));
}

function setupPermissions() {
  if (!settings.data.permissions) settings.data.permissions = {};
  const saved = settings.data.permissions;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (SAFE_PERMISSIONS.has(permission)) return callback(true);
    if (win && wc === win.webContents) return callback(false); // l'interface n'a besoin de rien
    const origin = originOf(details.requestingUrl || (wc && wc.getURL()));
    const keys = permissionKeys(permission, details);
    const known = keys.map((k) => saved[origin] && saved[origin][k]);
    if (known.every((v) => v !== undefined)) return callback(known.every(Boolean));
    const label = [...new Set(keys.map((k) => (PERMISSION_LABELS[k] ? t(PERMISSION_LABELS[k]) : k)))].join(t(' et '));
    const extra = permission === 'openExternal' && details.externalURL ? ` (${details.externalURL.slice(0, 60)})` : '';
    const lines = enqueue(t('{site} demande {what}{extra} : O = oui, t = toujours, j = jamais, n = non (O/n)', { site: origin, what: label, extra }), async (input, say) => {
      const a = input.toLowerCase();
      const ok = /^(|o|oui|y|yes|t|toujours|a|always)$/.test(a);
      if (/^(t|toujours|j|jamais|a|always|x|never)$/.test(a)) {
        saved[origin] = saved[origin] || {};
        for (const k of keys) saved[origin][k] = ok;
        settings.save();
      }
      callback(ok);
      say(ok ? t('  ✓ {what} : autorisé pour {site}', { what: label, site: origin }) : t('  ✗ {what} : refusé à {site}', { what: label, site: origin }), ok ? 'ok' : 'dim');
    });
    if (lines.length) {
      print(lines);
      focusTerminal();
    }
    return undefined;
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (SAFE_PERMISSIONS.has(permission)) return true;
    if (wc && win && wc === win.webContents) return false;
    const origin = originOf(requestingOrigin);
    const key = permission === 'media' ? (details.mediaType === 'video' ? 'camera' : 'microphone') : permission;
    return !!(saved[origin] && saved[origin][key] === true);
  });
}

function permCommand(args, say) {
  const saved = settings.data.permissions;
  if (args[0] === 'reset') {
    const origin = args[1] ? originOf(C.normalizeUrl(args[1])) : null;
    if (origin) delete saved[origin];
    else for (const k of Object.keys(saved)) delete saved[k];
    settings.save();
    say(origin ? t('  ✓ autorisations de {site} effacées', { site: origin }) : t('  ✓ autorisations effacées'), 'ok');
    return;
  }
  const entries = Object.entries(saved);
  if (!entries.length) say(t('  aucune autorisation enregistrée'), 'dim');
  for (const [origin, perms] of entries) {
    const list = Object.entries(perms).map(([k, v]) => `${v ? '✓' : '✗'} ${PERMISSION_LABELS[k] ? t(PERMISSION_LABELS[k]) : k}`).join(', ');
    say(`  ${origin} : ${list}`);
  }
  say(t('  perm reset [site] pour effacer'), 'dim');
}

// Autocomplétion avec Tab.
function complete(line) {
  const parts = line.split(' ');
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).filter(Boolean);
  const tree = favorites.data.tree;
  const favPaths = () => fav.flatten(tree).map((n) => (n.type === 'folder' ? `${n.path}/` : n.path));
  const folders = () => fav.flatten(tree).filter((n) => n.type === 'folder').map((n) => `${n.path}/`);
  let pool = [];
  if (!head.length) pool = [...C.COMMAND_NAMES, ...Object.keys(settings.data.aliases)];
  else if (head[0] === 'fav' && head.length === 1) pool = [...C.SUBCOMMANDS.fav, ...folders()];
  else if (head[0] === 'fav' && ['rm', 'mv', 'rename'].includes(head[1])) pool = head[1] === 'mv' && head.length === 3 ? folders() : favPaths();
  else if (head[0] === 'add') pool = folders();
  else if (head[0] === 'go' || head[0] === 'split') pool = [...new Set(fav.allLinks(tree).map((l) => shortUrl(l.url)))];
  else if (head[0] === 'unalias') pool = Object.keys(settings.data.aliases);
  else if ((head[0] === 'ia' || head[0] === 'ai') && head.length === 2 && ['use', 'connect', 'logout'].includes(head[1])) pool = Object.keys(ai.PROVIDERS);
  else if (head.length === 1 && C.SUBCOMMANDS[head[0]]) pool = C.SUBCOMMANDS[head[0]];
  const options = [...new Set(pool)].filter((p) => p.toLowerCase().startsWith(last.toLowerCase())).sort();
  if (!options.length) return { line, options: [] };
  const done = options.length === 1;
  const word = done ? options[0] : C.commonPrefix(options) || last;
  const suffix = done && !word.endsWith('/') ? ' ' : '';
  return { line: [...head, word].join(' ') + suffix, options: done ? [] : options.slice(0, 40) };
}

// ---------------------------------------------------------------- fenêtre et raccourcis

const SHORTCUTS = [
  ['Ctrl+L', mark('aller au terminal')],
  ['Ctrl+J', mark('cacher / montrer le terminal')],
  ['F11', mark('plein écran')],
  [mark('Échap'), mark('rendre la main à la page')],
  ['Ctrl+T / Ctrl+W', mark('nouvel onglet / fermer l\'onglet')],
  ['Ctrl+Tab', mark('onglet suivant (Ctrl+1…9 : onglet n)')],
  ['Alt+← / Alt+→', mark('précédent / suivant')],
  ['F5', mark('recharger')],
  ['Ctrl+F / Ctrl+D', mark('chercher dans la page / ajouter aux favoris')],
  [mark('Ctrl+Maj+S / F6'), mark('split / changer d\'écran')],
  [mark('F12, clic droit › Inspecter'), mark('outils de développement')],
  ['Alt+1…9', mark('popup de l\'extension n')],
  [mark('Ctrl+Maj+J'), mark('téléchargements (ou le bouton ↓ de la barre du bas)')],
  [mark('Ctrl+Maj+B'), mark('favoris (ou le bouton ★ en bas à gauche)')],
  [mark('Ctrl+molette, Ctrl+= / Ctrl+-'), 'zoom'],
  ['↑ ↓ / Tab', mark('historique des commandes / autocomplétion')],
];

// Recharge la page et retire l'écran du terminal (résultats, aide…) qui pouvait la cacher.
function reloadTab(tab) {
  if (!tab.view) throw new Error(t('aucune page ouverte'));
  tab.screen = null;
  tab.view.webContents.reload();
  layout();
  sendState();
}

function zoom(delta) {
  const tab = activeTab();
  if (!tab.view) return;
  const wc = tab.view.webContents;
  wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
  sendState();
}

function buildMenu() {
  const act = (fn) => () => {
    try {
      fn();
    } catch (err) {
      print([{ t: `  ${err.message}`, c: 'err' }]);
    }
  };
  const nav = (fn) => act(() => {
    const tab = activeTab();
    if (tab.view) fn(tab.view.webContents);
  });
  const template = [
    {
      label: 'dev-brows',
      submenu: [
        { label: 'Terminal', accelerator: 'CmdOrCtrl+L', click: () => focusTerminal() },
        { label: t('Cacher le terminal'), accelerator: 'CmdOrCtrl+J', click: () => win.webContents.send('term:toggle') },
        { label: t('Plein écran'), accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { label: t('Nouvel onglet'), accelerator: 'CmdOrCtrl+T', click: act(() => { createTab(); focusTerminal(); }) },
        { label: t('Fermer l\'onglet'), accelerator: 'CmdOrCtrl+W', click: act(() => closeTab(activeTab())) },
        { label: t('Onglet suivant'), accelerator: 'Ctrl+Tab', click: act(() => cycleTab(1)) },
        { label: t('Onglet précédent'), accelerator: 'Ctrl+Shift+Tab', click: act(() => cycleTab(-1)) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: t('Onglet {n}', { n }), accelerator: `CmdOrCtrl+${n}`, visible: false, click: act(() => tabs[n - 1] && showInPane(tabs[n - 1], activePane)),
        })),
        { label: t('Précédent'), accelerator: 'Alt+Left', click: nav((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
        { label: t('Suivant'), accelerator: 'Alt+Right', click: nav((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
        { label: t('Recharger'), accelerator: 'F5', click: act(() => reloadTab(activeTab())) },
        { label: t('Recharger'), accelerator: 'CmdOrCtrl+R', visible: false, click: act(() => reloadTab(activeTab())) },
        { label: t('Chercher'), accelerator: 'CmdOrCtrl+F', click: () => focusTerminal('find ') },
        { label: t('Ajouter aux favoris'), accelerator: 'CmdOrCtrl+D', click: () => focusTerminal('add ') },
        { label: 'Split', accelerator: 'CmdOrCtrl+Shift+S', click: () => runCommand(panes.length > 1 ? 'split off' : 'split') },
        { label: t('Changer d\'écran'), accelerator: 'F6', click: () => panes.length > 1 && runCommand('focus') },
        { label: t('Outils de développement'), accelerator: 'F12', click: act(() => toggleDevtools(activeTab())) },
        { label: t('Outils de développement'), accelerator: 'CmdOrCtrl+Shift+I', visible: false, click: act(() => toggleDevtools(activeTab())) },
        { label: t('Téléchargements'), accelerator: 'CmdOrCtrl+Shift+J', click: () => win.webContents.send('ui:panel', 'dl') },
        { label: t('Favoris'), accelerator: 'CmdOrCtrl+Shift+B', click: () => win.webContents.send('ui:panel', 'fav') },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Extension ${n}`, accelerator: `Alt+${n}`, visible: false, click: act(() => openExtPopup(n)),
        })),
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.5) },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => zoom(0.5) },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
        { label: t('Zoom normal'), accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
        { type: 'separator' },
        { role: 'quit', label: t('Quitter') },
      ],
    },
    {
      label: t('Édition'),
      submenu: [{ role: 'undo' }, { role: 'redo' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupDownloads() {
  ses.on('will-download', (e, item) => {
    // Enregistrement direct dans Téléchargements, sans boîte de dialogue.
    const dir = app.getPath('downloads');
    const parsed = path.parse(item.getFilename());
    let file = path.join(dir, parsed.base);
    for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${parsed.name} (${i})${parsed.ext}`);
    item.setSavePath(file);
    const d = { name: path.basename(file), path: file, state: 'progressing', received: 0, total: item.getTotalBytes() };
    downloads.unshift(d);
    print([{ t: t('  ↓ téléchargement de {name} (dl ou Ctrl+Maj+J pour suivre)', { name: d.name }), c: 'dim' }]);
    sendState();
    sendDl();
    let last = { time: Date.now(), bytes: 0 };
    let refreshed = 0;
    item.on('updated', () => {
      d.received = item.getReceivedBytes();
      d.total = item.getTotalBytes();
      d.paused = item.isPaused();
      // Vitesse lissée, mesurée sur au moins une demi-seconde.
      const now = Date.now();
      if (now - last.time >= 500) {
        const speed = ((d.received - last.bytes) * 1000) / (now - last.time);
        d.speed = d.speed ? d.speed * 0.6 + speed * 0.4 : speed;
        last = { time: now, bytes: d.received };
      }
      if (now - refreshed >= 250) {
        refreshed = now;
        sendDl();
      }
    });
    item.once('done', (ev, state) => {
      d.state = state;
      d.received = item.getReceivedBytes();
      print([{ t: state === 'completed' ? t('  ✓ {name} téléchargé', { name: d.name }) : t('  ✗ {name} interrompu', { name: d.name }), c: state === 'completed' ? 'ok' : 'err' }]);
      const tab = activeTab();
      if (tab.screen && tab.screen.kind === 'dl') showDl(tab);
      sendState();
      sendDl();
    });
  });
}

function setupIpc() {
  ipcMain.on('ui:layout', (e, r) => {
    rects = r.map((x) => x && { x: Math.round(x.x), y: Math.round(x.y), width: Math.round(x.width), height: Math.round(x.height) });
    layout();
  });
  ipcMain.on('ui:drag', (e, on) => {
    dragging = !!on;
    layout();
  });
  ipcMain.handle('ui:exec', (e, line) => {
    lastCommandAt = Date.now();
    return exec(String(line));
  });
  ipcMain.on('ui:zoom-reset', () => zoom(0));
  ipcMain.on('ui:lang', (e) => {
    e.returnValue = getLang();
  });
  ipcMain.handle('ui:complete', (e, line) => complete(String(line)));
  ipcMain.handle('ui:clipboard-read', () => clipboard.readText());
  ipcMain.on('ui:clipboard-write', (e, text) => clipboard.writeText(String(text)));
  let started = false;
  ipcMain.on('ui:ready', () => {
    sendState();
    if (!started) {
      started = true;
      startupUpdateNotes();
    }
  });
  ipcMain.on('ui:focus-page', () => {
    lastCommandAt = 0;
    const tab = activeTab();
    if (tab.screen && tab.view) {
      tab.screen = null;
      layout();
      sendState();
    }
    if (tab.view && !tab.screen) tab.view.webContents.focus();
  });
  ipcMain.on('ui:tab', (e, id) => {
    const t = getTab(id);
    if (t) showInPane(t, activePane);
  });
  ipcMain.on('ui:tab-move', (e, id, targetId) => {
    const from = tabs.findIndex((t) => t.id === id);
    const to = tabs.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    tabs.splice(to, 0, tabs.splice(from, 1)[0]);
    sendState();
  });
  ipcMain.on('ui:devtools', (e, action) => {
    const tab = activeTab();
    if (action === 'detach') detachDevtools(tab);
    else if (action === 'attach') attachDevtools(tab);
    else closeDevtools(tab);
  });
  ipcMain.on('ui:tab-close', (e, id) => {
    const t = getTab(id);
    if (t) closeTab(t);
  });
  ipcMain.on('ui:tab-new', () => {
    createTab();
    focusTerminal();
  });
  ipcMain.on('ui:pane', (e, idx) => {
    if (panes[idx] && idx !== activePane) {
      activePane = idx;
      sendState();
    }
  });
  ipcMain.on('ui:tab-mute', (e, id) => {
    const tab = getTab(id);
    if (tab) setMuted(tab, !isMuted(tab));
  });
  ipcMain.on('ui:volume', (e, v) => Number.isFinite(v) && setGlobalVolume(v));
  ipcMain.on('ui:panel', (e, kind, x) => PANELS[kind] && togglePanel(kind, Number.isFinite(x) ? x : undefined));
  const fromPanel = (e) => (panel && !panel.win.isDestroyed() && e.sender === panel.win.webContents ? panel : null);
  ipcMain.on('panel:act', (e, action, arg) => {
    const p = fromPanel(e);
    if (p) panelAction(p.kind, action, arg).catch((err) => print([{ t: `  ${err.message}`, c: 'err' }]));
  });
  ipcMain.on('panel:size', (e, height) => {
    const p = fromPanel(e);
    if (p && Number.isFinite(height)) p.win.setBounds(p.place(Math.min(Math.max(Math.ceil(height), 60), 520)));
  });
  ipcMain.on('ui:ext-popup', (e, n, x) => {
    try {
      openExtPopup(n, x);
    } catch (err) {
      print([{ t: `  ${err.message}`, c: 'err' }]);
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#0E1116',
    title: 'dev-brows',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  ses = session.defaultSession;
  const dir = app.getPath('userData');
  favorites = new JsonStore(path.join(dir, 'favoris.json'), { tree: fav.emptyTree() });
  history = new JsonStore(path.join(dir, 'historique.json'), { entries: [] });
  settings = new JsonStore(path.join(dir, 'reglages.json'), { engine: 'ddg', theme: 'ambre', aliases: {}, extensions: [], builtinAdblock: false });
  ai.migrate(settings);
  setLang(initialLang());
  setupChromeApi(); // avant le chargement des extensions, pour lire leurs manifestes
  watchExtensionLogs();
  ses.registerPreloadScript({ id: 'dev-brows-browser-alias', type: 'frame', filePath: path.join(__dirname, 'ext-preload.js') });
  exts = new Extensions(ses, settings, path.join(dir, 'extensions'));
  exts.installBundledUblock(app.isPackaged ? path.join(process.resourcesPath, 'ublock-origin') : path.join(__dirname, '..', '..', 'vendor', 'ublock-origin'));
  await exts.loadAll();
  setupIpc();
  setupDownloads();
  setupPermissions();
  setupWebAuthn();
  setupGoogleLogin();
  adblock = new AdBlock(ses, path.join(dir, 'adblock.bin'));
  if (settings.data.builtinAdblock) adblock.enable().catch((err) => print([{ t: t('  bloqueur de pub : listes non téléchargées ({error}), « adblock on » pour réessayer', { error: err.message }), c: 'err' }]));
  buildMenu();
  createWindow();
  createTab();
});

app.on('before-quit', () => {
  for (const s of [favorites, history, settings]) if (s) s.flush();
});

app.on('window-all-closed', () => app.quit());
