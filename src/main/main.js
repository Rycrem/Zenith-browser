'use strict';

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session, shell, clipboard, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('./store');
const { Extensions } = require('./extensions');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const ai = require('./ai');
const updater = require('./updater');
const fav = require('../shared/favorites');
const C = require('../shared/commands');
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

function setupGoogleLogin() {
  const ua = firefoxUserAgent();
  ses.webRequest.onBeforeSendHeaders({ urls: [`https://${GOOGLE_LOGIN}/*`] }, (details, callback) => {
    const headers = details.requestHeaders;
    for (const name of Object.keys(headers)) if (/^sec-ch-ua/i.test(name)) delete headers[name];
    headers['User-Agent'] = ua;
    callback({ requestHeaders: headers });
  });
}

function matchUserAgent(wc, url) {
  const ua = isGoogleLogin(url) ? firefoxUserAgent() : app.userAgentFallback;
  if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
}

const THEMES = { ambre: '#F2A541', vert: '#7FD18B', cyan: '#6CC5D9', rose: '#E07AA8' };
const HISTORY_MAX = 5000;
const DEVTOOLS_RATIO = 0.4;

let win = null;
let ses = null;
let chromeApi = null; // API d'extensions Chrome (onglets, fenêtres…) qu'Electron ne fournit pas
let favorites = null; // JsonStore { tree }
let history = null; // JsonStore { entries }
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
  print([{ t: installed ? '  extension déjà installée (« ext » pour la gérer)' : '  ↓ le bouton « Ajouter à Chrome » ne marche pas ici : tape « ext add » pour installer cette extension', c: installed ? 'dim' : 'warn' }]);
}

function wireWebContents(tab, wc) {
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame) matchUserAgent(wc, details.url);
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    sendState();
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    sendState();
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
    addHistory({ url, title: wc.getTitle() });
    storeHint(tab, url);
    sendState();
  });
  wc.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    storeHint(tab, url);
    sendState();
  });
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) print([{ t: `impossible de charger ${url} : ${desc}`, c: 'err' }]);
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
  wc.on('found-in-page', (e, r) => {
    if (r.finalUpdate) print([{ t: `  ${r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : 'aucun résultat'}`, c: 'dim' }]);
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
  tab.screen = null;
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
  if (panes.length === 1) throw new Error('pas de split en cours');
  const keep = panes[1 - idx];
  panes.splice(0, panes.length, keep);
  activePane = 0;
  layout();
  sendState();
}

function destroyTab(tab) {
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
  if (!tab.screen) return tab.title || shortUrl(tab.url) || 'nouvel onglet';
  const s = tab.screen;
  return { home: 'accueil', ai: `ia: ${s.question}`, results: `brows: ${s.query}`, fav: 'fav', hist: 'hist', ext: 'ext', dl: 'dl', tabs: 'tab', help: 'help', alias: 'alias', aiproviders: 'ia' }[s.kind] || s.kind;
}

// ---------------------------------------------------------------- disposition

function layout() {
  if (!win) return;
  tabs.forEach((tab) => {
    const p = paneOf(tab);
    const r = rects[p];
    const visible = p >= 0 && r && !tab.screen && !dragging && r.width > 0 && r.height > 0;
    const devOpen = visible && tab.dev && tab.devOpen;
    if (tab.view) tab.view.setVisible(!!visible);
    if (tab.dev) tab.dev.setVisible(!!devOpen);
    if (!visible) return;
    if (devOpen) {
      const devW = Math.round(r.width * DEVTOOLS_RATIO);
      tab.view.setBounds({ x: r.x, y: r.y, width: r.width - devW, height: r.height });
      tab.dev.setBounds({ x: r.x + r.width - devW, y: r.y, width: devW, height: r.height });
    } else {
      tab.view.setBounds(r);
    }
  });
}

function sendState() {
  if (!win || win.isDestroyed()) return;
  const tab = activeTab();
  if (!tab || panes.some((p) => !getTab(p.tabId))) return; // pendant la création d'un écran
  const favHere = tab && !tab.screen && fav.findByUrl(favorites.data.tree, tab.url);
  win.webContents.send('state', {
    user: os.userInfo().username,
    accent: THEMES[settings.data.theme] || THEMES.ambre,
    engine: settings.data.engine,
    tabs: tabs.map((t, i) => ({ id: t.id, n: i + 1, title: tabTitle(t), loading: t.loading, pane: paneOf(t) })),
    panes: panes.map((p) => {
      const t = getTab(p.tabId);
      return { tabId: p.tabId, screen: t.screen, page: !!t.view && !t.screen, url: t.url, title: t.screen ? tabTitle(t) : t.title || hostOf(t.url) || 'nouvel onglet' };
    }),
    activePane,
    status: {
      mode: tab.screen ? tabTitle(tab).split(':')[0].toUpperCase() : 'SITE',
      host: tab.screen ? tabTitle(tab) : hostOf(tab.url),
      url: tab.screen ? '' : tab.url,
      fav: favHere ? favHere.path : null,
      split: panes.length > 1,
    },
    exts: exts.summary(),
    downloads: downloads.filter((d) => d.state === 'progressing').length,
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

function showHome(tab) {
  const recent = fav.recent(favorites.data.tree, 6);
  setScreen(
    tab,
    { kind: 'home', user: os.userInfo().username, recent: recent.map((r, i) => ({ n: i + 1, path: r.path, url: r.url })) },
    recent.map((r) => ({ kind: 'url', url: r.url })),
  );
}

function showFav(tab, folder) {
  const tree = favorites.data.tree;
  const node = folder ? fav.getNode(tree, folder) : tree;
  if (!node || node.type !== 'folder') throw new Error(`dossier introuvable : ${folder}`);
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
    return [{ t: '  page de résultats ouverte, tape « links » pour numéroter les liens', c: 'dim' }];
  }
  let html;
  try {
    const res = form
      ? await net.fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
      })
      : await net.fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=fr-fr`);
    html = await res.text();
  } catch (err) {
    return [{ t: `recherche impossible : ${err.message}`, c: 'err' }];
  }
  const results = parseDuckDuckGoHtml(html);
  if (!results.length) {
    // DuckDuckGo a pu demander une vérification : on affiche sa page telle quelle.
    navigate(tab, C.ENGINES.ddg.url(query));
    return [{ t: '  aucun résultat lisible, page DuckDuckGo ouverte (tape « links »)', c: 'warn' }];
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
  return [{ t: `  ${results.length} résultats, page ${page} · n page suivante · tape un numéro`, c: 'dim' }];
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

async function numberLinks(tab) {
  if (!tab.view || tab.screen) throw new Error('aucune page ouverte');
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
  if (!tab.view) throw new Error('aucune page ouverte');
  const wc = tab.view.webContents;
  if (!tab.dev) {
    // Les DevTools s'affichent dans une vue à droite de la page, comme dans Chrome.
    tab.dev = new WebContentsView();
    win.contentView.addChildView(tab.dev);
    wc.setDevToolsWebContents(tab.dev.webContents);
    // Avec une vue DevTools à nous, isDevToolsOpened() reste faux : on suit l'état nous-mêmes.
    wc.on('devtools-closed', () => {
      tab.devOpen = false;
      layout();
    });
  }
  if (tab.screen) tab.screen = null;
  if (!tab.devOpen) wc.openDevTools({ mode: 'detach', activate: false });
  tab.devOpen = true;
  if (x !== undefined) wc.inspectElement(x, y);
  layout();
  sendState();
}

function toggleDevtools(tab) {
  if (tab.devOpen) {
    tab.devOpen = false;
    tab.view.webContents.closeDevTools();
    layout();
    return false;
  }
  openDevtools(tab);
  return true;
}

function showContextMenu(tab, p) {
  const wc = tab.view.webContents;
  const items = [
    { label: 'Précédent', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Suivant', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Recharger', click: () => wc.reload() },
    { type: 'separator' },
  ];
  if (p.linkURL) {
    items.push(
      { label: 'Ouvrir le lien dans un nouvel onglet', click: () => createTab({ url: p.linkURL, background: true }) },
      { label: 'Ouvrir le lien dans l\'autre écran', click: () => openInOtherPane(p.linkURL) },
      { label: 'Copier l\'adresse du lien', click: () => clipboard.writeText(p.linkURL) },
      { type: 'separator' },
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: 'Ouvrir l\'image dans un nouvel onglet', click: () => createTab({ url: p.srcURL, background: true }) },
      { label: 'Copier l\'image', click: () => wc.copyImageAt(p.x, p.y) },
      { label: 'Copier l\'adresse de l\'image', click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' },
    );
  }
  if (p.isEditable) {
    items.push({ role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { type: 'separator' });
  } else if (p.selectionText) {
    const text = p.selectionText.trim();
    items.push(
      { role: 'copy', label: 'Copier' },
      { label: `Rechercher « ${text.slice(0, 30)}${text.length > 30 ? '…' : ''} »`, click: () => runCommand(`brows ${text}`) },
      { type: 'separator' },
    );
  }
  items.push(
    { label: 'Ajouter aux favoris…', click: () => focusTerminal('add ') },
    { label: 'Code source de la page', click: () => createTab({ url: `view-source:${tab.url}` }) },
    { type: 'separator' },
    { label: 'Inspecter', click: () => openDevtools(tab, p.x, p.y) },
  );
  Menu.buildFromTemplate(items).popup({ window: win });
}

function openInOtherPane(url) {
  if (panes.length === 1) panes.push({ tabId: null });
  const target = activePane === 0 ? 1 : 0;
  const tab = createTab({ url, background: true });
  showInPane(tab, target);
}

// ---------------------------------------------------------------- extensions

function openExtPopup(n, x) {
  const url = exts.popupUrl(n);
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
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
const ANSWER = /^(o|oui|y|yes|n|non|no|t|toujours|j|jamais)?$/i;

// Met une question en file ; renvoie les lignes à afficher si c'est la seule en attente.
function enqueue(question, answer) {
  prompts.push({ question, answer });
  return prompts.length === 1 ? [{ t: `  ? ${question}`, c: 'warn' }] : [];
}

function confirm(question, run) {
  return enqueue(`${question} (o/N)`, async (input, say) => {
    if (YES.test(input)) await run(say);
    else say('  annulé', 'dim');
  });
}

function ask(say, question, run) {
  for (const l of confirm(question, run)) say(l.t, l.c);
}

async function runCommand(line) {
  const lines = await exec(line);
  print([{ t: `❯ ${line}`, c: 'cmd' }, ...lines.lines]);
}

async function exec(raw) {
  const out = [];
  const say = (t, c = '') => out.push({ t, c });
  const result = { lines: out };
  const input = raw.trim();
  const tab = activeTab();

  if (prompts.length) {
    // Une réponse répond à la question ; une autre commande vaut « non » puis s'exécute.
    const isAnswer = ANSWER.test(input);
    const p = prompts.shift();
    await p.answer(isAnswer ? input : 'non', say);
    if (prompts.length) say(`  ? ${prompts[0].question}`, 'warn');
    if (isAnswer) return result;
  }
  if (!input) return result;

  const line = C.expandAlias(input, settings.data.aliases);
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
        if (!rest) throw new Error('que faut-il chercher ? brows <recherche>');
        out.push(...(await runSearch(tab, rest)));
        break;
      case 'n':
      case 'next':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.next) throw new Error('pas de page suivante');
        out.push(...(await runSearch(tab, tab.screen.query, tab.screen.next)));
        break;
      case 'p':
      case 'prev':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.prev) throw new Error('pas de page précédente');
        setScreen(tab, tab.screen.prev, tab.screen.prev.results.map((r) => ({ kind: 'url', url: r.url })));
        break;
      case 'go':
      case 'open':
        if (!rest) throw new Error('quelle adresse ? go <url>');
        navigate(tab, C.normalizeUrl(rest));
        break;
      case 'links':
      case 'l': {
        const count = await numberLinks(tab);
        say(`  ${count} liens numérotés, tape un numéro (« 3t » pour un nouvel onglet)`, 'dim');
        break;
      }
      case 'back':
      case 'b':
        if (tab.screen && tab.view) {
          tab.screen = null;
          layout();
          sendState();
        } else if (tab.view && tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
        else if (tab.view) showHome(tab);
        else throw new Error('rien avant');
        break;
      case 'fwd':
      case 'f':
        if (!tab.view || !tab.view.webContents.navigationHistory.canGoForward()) throw new Error('rien après');
        tab.screen = null;
        tab.view.webContents.navigationHistory.goForward();
        layout();
        break;
      case 'reload':
      case 'r':
        if (!tab.view) throw new Error('aucune page ouverte');
        tab.screen = null;
        tab.view.webContents.reload();
        layout();
        break;
      case 'tab':
      case 'tabs':
        if (!args.length) showTabs(tab);
        else if (args[0] === 'new') {
          const url = args[1] ? C.normalizeUrl(args.slice(1).join(' ')) : undefined;
          createTab({ url });
        } else {
          const t = tabs[Number(args[0]) - 1];
          if (!t) throw new Error(`pas d'onglet numéro ${args[0]}`);
          showInPane(t, activePane);
        }
        break;
      case 'close': {
        const t = args.length ? tabs[Number(args[0]) - 1] : tab;
        if (!t) throw new Error(`pas d'onglet numéro ${args[0]}`);
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
          say('  déjà en split : « focus » change d\'écran, « split off » ferme l\'autre écran (« split off 1|2 » pour choisir)', 'dim');
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
        if (panes.length === 1) throw new Error('pas de split en cours');
        activePane = activePane === 0 ? 1 : 0;
        sendState();
        break;
      case 'fav':
        await favCommand(tab, args, say);
        break;
      case 'add': {
        if (!tab.view || !tab.url) throw new Error('aucune page ouverte à ajouter');
        if (!args.length) throw new Error('il faut un nom : add [dossier/]nom');
        const r = fav.addFavorite(favorites.data.tree, args.join(' '), tab.url, tab.view.webContents.getTitle());
        favorites.save();
        if (r.createdFolders.length) say(`  ✓ dossier ${r.createdFolders.join('/')}/ créé`, 'ok');
        say(`  ✓ ${r.updated ? 'favori mis à jour' : 'ajouté aux favoris'} : ${r.path}`, 'ok');
        sendState();
        break;
      }
      case 'undo':
        if (!lastUndo) throw new Error('rien à annuler');
        fav.restoreFavorite(favorites.data.tree, lastUndo);
        favorites.save();
        say(`  ✓ ${lastUndo.node.name} restauré`, 'ok');
        lastUndo = null;
        if (tab.screen && tab.screen.kind === 'fav') showFav(tab, tab.screen.folder);
        break;
      case 'hist':
      case 'history':
        showHist(tab, rest);
        break;
      case 'clean':
        if (args[0] === 'all') {
          out.push(...confirm('vider historique, cookies et cache ? tu seras déconnecté des sites', async (s) => {
            history.data.entries = [];
            history.save();
            await ses.clearStorageData({ storages: ['cookies'] });
            await ses.clearCache();
            s('  ✓ historique, cookies et cache vidés', 'ok');
          }));
        } else {
          history.data.entries = [];
          history.save();
          say('  ✓ historique vidé', 'ok');
          if (tab.screen && tab.screen.kind === 'hist') showHist(tab, '');
        }
        break;
      case 'find':
        if (!tab.view || tab.screen) throw new Error('aucune page ouverte');
        if (!rest) {
          tab.view.webContents.stopFindInPage('clearSelection');
          tab.findText = '';
        } else {
          tab.view.webContents.findInPage(rest, { findNext: tab.findText === rest });
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
        if (!args[0] || !settings.data.aliases[args[0]]) throw new Error(`pas d'alias « ${args[0] || ''} »`);
        delete settings.data.aliases[args[0]];
        settings.save();
        say(`  ✓ alias ${args[0]} supprimé`, 'ok');
        break;
      case 'engine':
        if (!args.length) say(`  moteur : ${C.ENGINES[settings.data.engine].label} (ddg | google | bing | qwant)`);
        else {
          if (!C.ENGINES[args[0]]) throw new Error('moteurs : ddg, google, bing, qwant');
          settings.data.engine = args[0];
          settings.save();
          say(`  ✓ moteur : ${C.ENGINES[args[0]].label}${args[0] === 'ddg' ? '' : ' (résultats affichés sur sa page, « links » pour numéroter)'}`, 'ok');
        }
        break;
      case 'theme':
        if (!args.length) say(`  thèmes : ${Object.keys(THEMES).join(', ')} (actuel : ${settings.data.theme})`);
        else {
          if (!THEMES[args[0]]) throw new Error(`thèmes : ${Object.keys(THEMES).join(', ')}`);
          settings.data.theme = args[0];
          settings.save();
          sendState();
        }
        break;
      case 'perm':
        permCommand(args, say);
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
        toggleDevtools(tab);
        break;
      case 'term':
        result.hideTerminal = true;
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
    throw new Error(tab.numbered.length ? `pas de numéro ${n} ici (1 à ${tab.numbered.length})` : 'aucune liste numérotée ici (essaie « links »)');
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
      else if (!(await clickLink(tab, item.i))) throw new Error('ce lien n\'existe plus, relance « links »');
      tab.numbered = [];
      break;
    case 'tab': {
      const t = getTab(item.id);
      if (!t) throw new Error('onglet fermé');
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
      if (!item.path) throw new Error('fichier pas encore enregistré');
      if (newTab) shell.showItemInFolder(item.path);
      else {
        const err = await shell.openPath(item.path);
        if (err) throw new Error(err);
      }
      break;
    default:
  }
  if (newTab) say('  ouvert dans un nouvel onglet', 'dim');
}

function favPathArg(tab, arg) {
  // Accepte un chemin ou le numéro affiché dans « fav ».
  if (/^\d+$/.test(arg) && tab.numberedKind === 'fav') {
    const item = tab.numbered[Number(arg) - 1];
    if (item) return item.path;
  }
  return arg;
}

async function favCommand(tab, args, say) {
  const tree = favorites.data.tree;
  const sub = args[0];
  if (sub === 'rm' || sub === 'del') {
    if (!args[1]) throw new Error('fav rm <chemin | n>');
    const target = favPathArg(tab, args.slice(1).join(' '));
    const node = fav.getNode(tree, target);
    if (!node) throw new Error(`favori introuvable : ${target}`);
    const what = node.type === 'folder' ? `le dossier ${target}/ et son contenu` : target;
    ask(say, `supprimer ${what} ?`, async (s) => {
      lastUndo = fav.removeFavorite(tree, target);
      favorites.save();
      s('  ✓ supprimé (undo pour annuler)', 'ok');
      if (tab.screen && tab.screen.kind === 'fav') showFav(tab, tab.screen.folder);
      sendState();
    });
    return;
  }
  if (sub === 'mv') {
    if (args.length < 3) throw new Error('fav mv <chemin> <destination>');
    const node = fav.moveFavorite(tree, favPathArg(tab, args[1]), args[2]);
    favorites.save();
    say(`  ✓ ${node.name} déplacé vers ${args[2]}`, 'ok');
  } else if (sub === 'rename') {
    if (args.length < 3) throw new Error('fav rename <chemin> <nouveau nom>');
    fav.renameFavorite(tree, favPathArg(tab, args[1]), args[2]);
    favorites.save();
    say(`  ✓ renommé en ${args[2]}`, 'ok');
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
      if (!source) throw new Error('ext add <lien du Chrome Web Store | identifiant | dossier>, ou « ext add » seul sur la page de l\'extension');
      print([{ t: '  installation de l\'extension…', c: 'dim' }]);
      const ext = await exts.add(source);
      say(`  ✓ ${ext.name} installée, alias « ${ext.alias} »${ext.popup ? '' : ' (pas de popup)'}`, 'ok');
      break;
    }
    case 'on':
    case 'off': {
      const ext = await exts.setEnabled(n, sub === 'on');
      say(`  ✓ ${ext.alias} ${sub === 'on' ? 'activée' : 'désactivée'}`, 'ok');
      break;
    }
    case 'rm': {
      const ext = exts.get(n);
      ask(say, `désinstaller ${ext.name} ?`, async (s) => {
        exts.remove(n);
        s('  ✓ extension désinstallée', 'ok');
        if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
        sendState();
      });
      return;
    }
    case 'alias':
      exts.rename(n, args[2]);
      say(`  ✓ alias : ${args[2]}`, 'ok');
      break;
    default:
      throw new Error('ext [add | on | off | rm | alias | n]');
  }
  if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
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
    if (!aliases[key]) throw new Error(`pas d'alias « ${key} »`);
    say(`  ${key} = ${aliases[key]}`);
    return;
  }
  if (C.COMMAND_NAMES.includes(key)) throw new Error(`« ${key} » est déjà une commande`);
  aliases[key] = value;
  settings.save();
  say(`  ✓ alias ${key} = ${value}`, 'ok');
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
  say(`  ✓ ia : ${p.name} · modèle ${ai.model(settings, id)}`, 'ok');
  if (!p.noKey && !ai.readKey(settings, id)) {
    say(`  il faut une clé${p.free ? ' (gratuite)' : ''} : crée-la sur la page ouverte, puis tape « ia key <clé> »`, 'warn');
    createTab({ url: p.keyUrl });
  } else if (id === 'ollama') {
    say(`  Ollama doit tourner sur cet ordinateur avec le modèle installé (« ollama pull ${ai.model(settings, id)} »)`, 'dim');
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
      else say(`  ia key <clé de ${ai.PROVIDERS[id].name}>`, 'err');
      return;
    }
    const encrypted = ai.saveKey(settings, id, key);
    say(`  ✓ clé ${ai.PROVIDERS[id].name} enregistrée${encrypted ? ' (chiffrée par le système)' : ' (le système ne permet pas de la chiffrer)'}`, 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'use' && args.length === 2) {
    if (!target) throw new Error(`IA inconnue : ${args[1]} (${Object.keys(ai.PROVIDERS).join(', ')})`);
    aiUse(tab, target, say);
    return;
  }
  if (sub === 'logout' && args.length <= 2) {
    const id = args[1] ? target : ai.current(settings);
    if (!id) throw new Error(`IA inconnue : ${args[1]}`);
    say(ai.removeKey(settings, id) ? `  ✓ clé ${ai.PROVIDERS[id].name} supprimée` : `  pas de clé enregistrée pour ${ai.PROVIDERS[id].name}`, 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'model' && args.length <= 2) {
    const id = ai.current(settings);
    if (args[1]) ai.setModel(settings, id, args[1] === 'default' ? ai.PROVIDERS[id].model : args[1]);
    say(`  modèle ${ai.PROVIDERS[id].name} : ${ai.model(settings, id)}`);
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
    screen.text = r.text || (r.refused ? '' : '(pas de réponse)');
    screen.sources = r.sources.map((src, i) => ({ n: i + 1, ...src, short: shortUrl(src.url) }));
    if (r.refused) screen.error = `${screen.provider} a refusé de répondre à cette question.`;
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

async function updateCommand(args, say) {
  const sub = args[0];
  if (updater.installed()) {
    if (sub === 'electron') {
      say('  Electron est inclus dans l\'installateur : « update install » installe la dernière version publiée', 'dim');
      return;
    }
    if (sub === 'install') {
      // Sans signature Apple, macOS refuse l'installation automatique : on ouvre la page de téléchargement.
      if (process.platform === 'darwin') {
        createTab({ url: updater.RELEASES_URL });
        say('  page des installateurs ouverte : télécharge le .dmg de la dernière version', 'dim');
        return;
      }
      ask(say, 'télécharger et installer la dernière version ? l\'appli redémarrera', async (s) => {
        print([{ t: '  téléchargement de l\'installateur…', c: 'dim' }]);
        let last = -10;
        try {
          const started = await updater.installRelease((pct) => {
            if (pct - last >= 10 || pct === 100) {
              last = pct;
              print([{ t: `  ↓ ${pct} %`, c: 'dim' }]);
            }
          });
          if (!started) s('  ✓ déjà à jour', 'ok');
        } catch (err) {
          s(`  mise à jour impossible : ${err.message}`, 'err');
          createTab({ url: updater.RELEASES_URL });
          s('  page des installateurs ouverte pour la faire à la main', 'dim');
        }
      });
      return;
    }
  } else if (sub === 'install' || sub === 'electron') {
    const what = sub === 'electron'
      ? 'passer à la dernière version majeure d\'Electron (peut casser des choses, à tester)'
      : 'mettre à jour l\'appli et Electron dans sa version actuelle';
    ask(say, `${what} ? l'appli va se fermer puis se relancer`, async (s) => {
      await updater.launchSource(sub === 'electron' ? 'electron' : 'app');
      s('  mise à jour lancée, l\'appli redémarre…', 'ok');
      setTimeout(() => app.quit(), 600);
    });
    return;
  }
  say('  vérification…', 'dim');
  const r = await updater.check();
  settings.data.lastUpdateCheck = Date.now();
  settings.save();
  for (const l of updateLines(r)) say(l.t, l.c);
}

function updateLines(r) {
  if (r.installed) {
    const lines = [{ t: `  dev-brows ${r.current} (Electron ${process.versions.electron}, Chromium ${process.versions.chrome})` }];
    if (r.available) lines.push({ t: `  ↑ nouvelle version publiée sur GitHub : ${r.latest} → « update install »`, c: 'warn' });
    else lines.push({ t: '  ✓ à jour', c: 'ok' });
    return lines;
  }
  const lines = [{ t: `  Electron ${r.current} (Chromium ${process.versions.chrome}), lancé depuis le code` }];
  const patch = r.sameMajor !== r.current;
  if (patch) lines.push({ t: `  ↑ correctifs disponibles : Electron ${r.sameMajor} → « update install »`, c: 'warn' });
  if (updater.major(r.latest) > updater.major(r.current)) {
    lines.push({ t: `  ↑ nouvelle version majeure : Electron ${r.latest} → « update electron » (à tester)`, c: 'dim' });
  }
  if (r.behind) lines.push({ t: `  ↑ ${r.behind} nouveau${r.behind > 1 ? 'x' : ''} commit${r.behind > 1 ? 's' : ''} sur le dépôt → « update install »`, c: 'warn' });
  if (!patch && !r.behind) lines.push({ t: '  ✓ à jour', c: 'ok' });
  return lines;
}

// Au démarrage : compte rendu de la dernière mise à jour, et une vérification par jour.
function startupUpdateNotes() {
  const report = updater.lastReport();
  if (report) {
    const versions = report.before !== report.after ? ` (Electron ${report.before} → ${report.after})` : '';
    print([{ t: `  ${report.ok ? '✓ mise à jour terminée' : '✗ mise à jour incomplète'}${versions}`, c: report.ok ? 'ok' : 'err' }]);
    for (const step of report.steps.filter((st) => !st.ok)) print([{ t: `    ${step.cmd} : ${step.output}`, c: 'err' }]);
  }
  if (updater.installed() && settings.data.lastVersion && settings.data.lastVersion !== app.getVersion()) {
    print([{ t: `  ✓ dev-brows mis à jour en ${app.getVersion()}`, c: 'ok' }]);
  }
  settings.data.lastVersion = app.getVersion();
  settings.save();
  if (Date.now() - (settings.data.lastUpdateCheck || 0) < 24 * 3600 * 1000) return;
  setTimeout(async () => {
    try {
      const r = await updater.check();
      settings.data.lastUpdateCheck = Date.now();
      settings.save();
      print(updateLines(r).filter((l) => l.c === 'warn'));
    } catch {
      // hors ligne : on réessaiera au prochain démarrage
    }
  }, 8000);
}

// ---------------------------------------------------------------- autorisations des sites

// Sans réglage, Electron accorde tout (caméra, micro, position…) sans demander.
// Ici, chaque demande passe par une question dans le terminal.
const SAFE_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write', 'mediaKeySystem']);

const PERMISSION_LABELS = {
  camera: 'la caméra',
  microphone: 'le micro',
  geolocation: 'ta position',
  notifications: 'les notifications',
  'clipboard-read': 'la lecture du presse-papier',
  'display-capture': 'le partage d\'écran',
  midi: 'les appareils MIDI',
  midiSysex: 'les appareils MIDI',
  openExternal: 'l\'ouverture d\'une application externe',
  'idle-detection': 'la détection d\'inactivité',
  'storage-access': 'ses cookies sur d\'autres sites',
  'top-level-storage-access': 'ses cookies sur d\'autres sites',
  'window-management': 'la gestion des fenêtres et écrans',
  'speaker-selection': 'le choix de la sortie audio',
};

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url || 'ce site';
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
    const label = [...new Set(keys.map((k) => PERMISSION_LABELS[k] || k))].join(' et ');
    const extra = permission === 'openExternal' && details.externalURL ? ` (${details.externalURL.slice(0, 60)})` : '';
    const lines = enqueue(`${origin} demande ${label}${extra} : o = oui, t = toujours, j = jamais, N = non`, async (input, say) => {
      const a = input.toLowerCase();
      const ok = /^(o|oui|y|yes|t|toujours)$/.test(a);
      if (/^(t|toujours|j|jamais)$/.test(a)) {
        saved[origin] = saved[origin] || {};
        for (const k of keys) saved[origin][k] = ok;
        settings.save();
      }
      callback(ok);
      say(ok ? `  ✓ ${label} : autorisé pour ${origin}` : `  ✗ ${label} : refusé à ${origin}`, ok ? 'ok' : 'dim');
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
    say(`  ✓ autorisations ${origin ? `de ${origin} ` : ''}effacées`, 'ok');
    return;
  }
  const entries = Object.entries(saved);
  if (!entries.length) say('  aucune autorisation enregistrée', 'dim');
  for (const [origin, perms] of entries) {
    const list = Object.entries(perms).map(([k, v]) => `${v ? '✓' : '✗'} ${PERMISSION_LABELS[k] || k}`).join(', ');
    say(`  ${origin} : ${list}`);
  }
  say('  perm reset [site] pour effacer', 'dim');
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
  ['Ctrl+L', 'aller au terminal'],
  ['Ctrl+J', 'cacher / montrer le terminal'],
  ['Échap', 'rendre la main à la page'],
  ['Ctrl+T / Ctrl+W', 'nouvel onglet / fermer l\'onglet'],
  ['Ctrl+Tab', 'onglet suivant (Ctrl+1…9 : onglet n)'],
  ['Alt+← / Alt+→', 'précédent / suivant'],
  ['F5', 'recharger'],
  ['Ctrl+F / Ctrl+D', 'chercher dans la page / ajouter aux favoris'],
  ['Ctrl+Maj+S / F6', 'split / changer d\'écran'],
  ['F12, clic droit › Inspecter', 'outils de développement'],
  ['Alt+1…9', 'popup de l\'extension n'],
  ['Ctrl+molette, Ctrl+= / Ctrl+-', 'zoom'],
  ['↑ ↓ / Tab', 'historique des commandes / autocomplétion'],
];

function zoom(delta) {
  const tab = activeTab();
  if (!tab.view) return;
  const wc = tab.view.webContents;
  wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
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
        { label: 'Cacher le terminal', accelerator: 'CmdOrCtrl+J', click: () => win.webContents.send('term:toggle') },
        { label: 'Nouvel onglet', accelerator: 'CmdOrCtrl+T', click: act(() => { createTab(); focusTerminal(); }) },
        { label: 'Fermer l\'onglet', accelerator: 'CmdOrCtrl+W', click: act(() => closeTab(activeTab())) },
        { label: 'Onglet suivant', accelerator: 'Ctrl+Tab', click: act(() => cycleTab(1)) },
        { label: 'Onglet précédent', accelerator: 'Ctrl+Shift+Tab', click: act(() => cycleTab(-1)) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Onglet ${n}`, accelerator: `CmdOrCtrl+${n}`, visible: false, click: act(() => tabs[n - 1] && showInPane(tabs[n - 1], activePane)),
        })),
        { label: 'Précédent', accelerator: 'Alt+Left', click: nav((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
        { label: 'Suivant', accelerator: 'Alt+Right', click: nav((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
        { label: 'Recharger', accelerator: 'F5', click: nav((wc) => wc.reload()) },
        { label: 'Recharger', accelerator: 'CmdOrCtrl+R', visible: false, click: nav((wc) => wc.reload()) },
        { label: 'Chercher', accelerator: 'CmdOrCtrl+F', click: () => focusTerminal('find ') },
        { label: 'Ajouter aux favoris', accelerator: 'CmdOrCtrl+D', click: () => focusTerminal('add ') },
        { label: 'Split', accelerator: 'CmdOrCtrl+Shift+S', click: () => runCommand(panes.length > 1 ? 'split off' : 'split') },
        { label: 'Changer d\'écran', accelerator: 'F6', click: () => panes.length > 1 && runCommand('focus') },
        { label: 'Outils de développement', accelerator: 'F12', click: act(() => toggleDevtools(activeTab())) },
        { label: 'Outils de développement', accelerator: 'CmdOrCtrl+Shift+I', visible: false, click: act(() => toggleDevtools(activeTab())) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Extension ${n}`, accelerator: `Alt+${n}`, visible: false, click: act(() => openExtPopup(n)),
        })),
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.5) },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => zoom(0.5) },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
        { label: 'Zoom normal', accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
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
    print([{ t: `  ↓ téléchargement de ${d.name} (dl pour suivre)`, c: 'dim' }]);
    sendState();
    item.on('updated', () => {
      d.received = item.getReceivedBytes();
    });
    item.once('done', (ev, state) => {
      d.state = state;
      d.received = item.getReceivedBytes();
      print([{ t: `  ${state === 'completed' ? '✓' : '✗'} ${d.name} ${state === 'completed' ? 'téléchargé' : 'interrompu'}`, c: state === 'completed' ? 'ok' : 'err' }]);
      const tab = activeTab();
      if (tab.screen && tab.screen.kind === 'dl') showDl(tab);
      sendState();
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
  ipcMain.handle('ui:exec', (e, line) => exec(String(line)));
  ipcMain.handle('ui:complete', (e, line) => complete(String(line)));
  let started = false;
  ipcMain.on('ui:ready', () => {
    sendState();
    if (!started) {
      started = true;
      startupUpdateNotes();
    }
  });
  ipcMain.on('ui:focus-page', () => {
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
  settings = new JsonStore(path.join(dir, 'reglages.json'), { engine: 'ddg', theme: 'ambre', aliases: {}, extensions: [] });
  ai.migrate(settings);
  setupChromeApi(); // avant le chargement des extensions, pour lire leurs manifestes
  exts = new Extensions(ses, settings, path.join(dir, 'extensions'));
  await exts.loadAll();
  setupIpc();
  setupDownloads();
  setupPermissions();
  setupGoogleLogin();
  buildMenu();
  createWindow();
  createTab();
});

app.on('before-quit', () => {
  for (const s of [favorites, history, settings]) if (s) s.flush();
});

app.on('window-all-closed', () => app.quit());
