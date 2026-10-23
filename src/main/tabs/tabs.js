'use strict';

const { Menu } = require('electron');
const { t } = require('../../shared/i18n');
const { shortUrl } = require('../../shared/search');
const state = require('../state');
const ui = require('../window/ui');
const lastSession = require('./last-session');
const navigation = require('./navigation');
const split = require('../split/split');
const screens = require('../terminal/screens');
const output = require('../terminal/output');
const findInPage = require('../search/find-in-page');
const devtools = require('../devtools/devtools');
const privateBrowsing = require('../private/private');
const mainWindow = require('../window/window');

const closedTabs = []; // onglets fermés, le plus récent d'abord : { url, title }

let nextTabId = 1;

const sesOf = (tab) => (tab && tab.private ? state.privSes : state.ses);
const apiOf = (tab) => (tab && tab.private ? state.privApi : state.chromeApi);

function getTab(id) {
  return state.tabs.find((t) => t.id === id) || null;
}

function activeTab() {
  return getTab(state.panes[state.activePane].tabId);
}

function paneOf(tab) {
  return state.panes.findIndex((p) => p.tabId === tab.id);
}

// En split, chaque écran a ses propres onglets (tab.side : 0 ou 1). Ceux de gauche restent
// en tête de la liste, pour que les numéros se suivent d'une barre à l'autre.
const sideOf = (tab) => (state.panes.length > 1 ? tab.side : 0);
const sideTabs = (side) => state.tabs.filter((tb) => sideOf(tb) === side);
const sortSides = () => state.tabs.sort((a, b) => a.side - b.side);

// L'onglet est choisi dans son propre écran.
function selectTab(tab) {
  split.showInPane(tab, sideOf(tab));
}

// Un autre onglet du même côté, ou un nouveau s'il n'en reste pas.
function replacement(side, except) {
  return sideTabs(side).find((tb) => tb !== except) || createTab({ background: true, pane: side });
}

// priv : onglet privé ; par défaut, comme l'onglet affiché dans l'écran (split dont un écran est privé).
// opener : onglet d'où vient le lien (Ctrl+clic…) ; le nouvel onglet se place juste après lui, et
// après ceux déjà ouverts depuis lui à la suite, pour qu'ils restent dans l'ordre des clics.
function createTab({ url, background = false, pane = state.activePane, priv, opener } = {}) {
  const shown = state.panes[pane] && getTab(state.panes[pane].tabId);
  const isPrivate = !!state.privateMode || (priv !== undefined ? !!priv : !!(shown && shown.private));
  const tab = { id: nextTabId++, side: state.panes.length > 1 ? pane : 0, view: null, dev: null, screen: null, numbered: [], title: '', url: '', loading: false, private: isPrivate };
  let at = opener && sideOf(opener) === tab.side ? state.tabs.indexOf(opener) + 1 : 0;
  if (at) {
    tab.openerId = opener.id;
    while (state.tabs[at] && state.tabs[at].openerId === opener.id) at++;
    state.tabs.splice(at, 0, tab);
  } else state.tabs.push(tab);
  sortSides();
  if (url) navigation.navigate(tab, url);
  else screens.showHome(tab);
  if (!background) split.showInPane(tab, pane);
  else ui.sendState();
  lastSession.saveSession();
  return tab;
}

function reopenClosed(i = 0) {
  const c = closedTabs.splice(i, 1)[0];
  if (!c) throw new Error(t('aucun onglet fermé à rouvrir'));
  createTab({ url: c.url });
}

// Clic droit sur + : les onglets fermés, le plus récent en premier.
function recentMenu() {
  const recent = closedTabs.map((c, i) => ({ label: (c.title || shortUrl(c.url)).slice(0, 70), click: () => reopenClosed(i) }));
  Menu.buildFromTemplate([
    { label: t('Nouvel onglet'), accelerator: 'CmdOrCtrl+T', click: () => { createTab(); output.focusTerminal(); } },
    { label: t('Rouvrir l\'onglet fermé'), accelerator: 'CmdOrCtrl+Shift+T', enabled: closedTabs.length > 0, click: () => reopenClosed(0) },
    { label: t('Onglets récents'), submenu: recent.length ? recent : [{ label: t('Aucun onglet fermé'), enabled: false }] },
  ]).popup({ window: state.win });
}

function destroyTab(tab) {
  if (tab.devWin) devtools.attachDevtools(tab);
  for (const v of [tab.view, tab.dev]) {
    if (!v) continue;
    state.win.contentView.removeChildView(v);
    if (v.webContents) v.webContents.close(); // déjà détruit si la page s'est fermée seule
  }
}

function closeTab(tab) {
  const i = state.tabs.indexOf(tab);
  if (i < 0) return;
  const side = sideOf(tab);
  const si = sideTabs(side).indexOf(tab);
  state.tabs.splice(i, 1);
  if (state.findWin && state.findWin.tabId === tab.id) findInPage.closeFind(false);
  // Dernier onglet privé d'un écran fermé : ses données s'effacent aussitôt.
  if (tab.private && !state.privateMode && state.privSes && !state.allTabs().some((tb) => tb.private)) privateBrowsing.wipePrivate();
  if (!tab.private && /^(https?|file):/.test(tab.url)) {
    closedTabs.unshift({ url: tab.url, title: tab.title });
    if (closedTabs.length > 25) closedTabs.pop();
  }
  destroyTab(tab);
  // Dernier onglet d'un écran du split : l'autre écran reprend toute la place.
  if (state.panes.length > 1 && !sideTabs(side).length) {
    split.closePane(side);
    output.focusTerminal();
    return;
  }
  state.panes.forEach((p, pi) => {
    if (p.tabId !== tab.id) return;
    const same = sideTabs(side);
    p.tabId = (same[Math.min(si, same.length - 1)] || createTab({ background: true, pane: pi })).id;
    if (pi === state.activePane) output.focusTerminal();
  });
  ui.layout();
  ui.sendState();
}

// Plusieurs fenêtres. Un onglet passe d'une fenêtre à l'autre avec sa page (et ses DevTools
// ancrés) : target est un état de state.allWindows(), gap sa place parmi les onglets de
// target (à la fin sinon). Sa fenêtre d'origine se ferme s'il était son dernier onglet.
// Pas pendant la navigation privée d'une fenêtre : ses onglets normaux y sont mis de côté.
function moveTabToWindow(tab, target, gap, focus = true) {
  const from = state.windowOfTab(tab);
  if (!from || !target || from === target || !target.win || from.privateMode || target.privateMode) return false;
  const last = from.tabs.length === 1;
  state.inWindow(from, () => {
    const side = sideOf(tab);
    const si = sideTabs(side).indexOf(tab);
    state.tabs.splice(state.tabs.indexOf(tab), 1);
    if (state.findWin && state.findWin.tabId === tab.id) findInPage.closeFind(false);
    if (state.fullTab === tab) ui.setHtmlFullscreen(tab, false);
    if (tab.view) state.win.contentView.removeChildView(tab.view);
    if (tab.dev && !tab.devWin) state.win.contentView.removeChildView(tab.dev);
    if (last) return;
    if (state.panes.length > 1 && !sideTabs(side).length) split.closePane(side);
    else {
      for (const p of state.panes) {
        if (p.tabId !== tab.id) continue;
        const same = sideTabs(side);
        p.tabId = same[Math.min(si, same.length - 1)].id;
      }
    }
    ui.layout();
    ui.sendState();
  });
  state.inWindow(target, () => {
    tab.side = state.panes.length > 1 ? state.activePane : 0;
    state.tabs.splice(Number.isInteger(gap) && gap >= 0 && gap <= state.tabs.length ? gap : state.tabs.length, 0, tab);
    sortSides();
    if (tab.view) state.win.contentView.addChildView(tab.view);
    if (tab.dev && !tab.devWin) state.win.contentView.addChildView(tab.dev);
    // Pour les extensions, l'onglet change de fenêtre (sans le retirer, ce qui le fermerait).
    try {
      const store = apiOf(tab).ctx.store;
      store.tabToWindow.set(tab.view.webContents, state.win);
      store.addWindow(state.win);
    } catch {}
    split.showInPane(tab, sideOf(tab));
    if (focus) state.win.focus();
  });
  if (last) from.win.close();
  return true;
}

// Onglet sorti de sa fenêtre : une nouvelle fenêtre à bounds, rien que pour lui. Seul dans la
// sienne, il la garde (c'est elle qui suit la souris). inactive : pendant le glissement, la
// nouvelle fenêtre ne prend pas le focus (l'ancienne perdrait la souris).
function detachTab(tab, bounds, inactive = false) {
  const from = state.windowOfTab(tab);
  if (!from || from.privateMode) return null;
  if (from.tabs.length === 1) return from;
  const w = state.addWindow();
  state.inWindow(w, () => mainWindow.createWindow(bounds, inactive));
  moveTabToWindow(tab, w, undefined, !inactive);
  return w;
}

// Onglet suivant ou précédent, parmi ceux de l'écran actif.
function cycleTab(dir) {
  const same = sideTabs(state.activePane);
  const i = same.indexOf(activeTab());
  split.showInPane(same[(i + dir + same.length) % same.length], state.activePane);
}

function tabTitle(tab) {
  if (!tab.screen) return tab.title || shortUrl(tab.url) || t('nouvel onglet');
  const s = tab.screen;
  return { home: t('accueil'), ai: `ia: ${s.question}`, results: `brows: ${s.query}`, fav: 'fav', hist: 'hist', ext: 'ext', dl: 'dl', tabs: 'tab', help: 'help', alias: 'alias', aiproviders: 'ia', tty: `tty: ${s.title || s.host}` }[s.kind] || s.kind;
}

function showTabs(tab) {
  screens.setScreen(
    tab,
    { kind: 'tabs', rows: state.tabs.map((t, i) => ({ n: i + 1, title: tabTitle(t), url: t.screen ? '' : t.url, pane: paneOf(t) })) },
    state.tabs.map((t) => ({ kind: 'tab', id: t.id })),
  );
}

Object.assign(module.exports, { moveTabToWindow, detachTab, sesOf, apiOf, getTab, activeTab, paneOf, sideOf, sortSides, selectTab, replacement, createTab, reopenClosed, recentMenu, destroyTab, closeTab, cycleTab, tabTitle, showTabs });
