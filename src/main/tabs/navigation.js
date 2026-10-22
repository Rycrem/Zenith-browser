'use strict';

const { t } = require('../../shared/i18n');
const { shortUrl } = require('../../shared/search');
const ui = require('../window/ui');
const tabList = require('./tabs');
const pageView = require('./page-view');
const screens = require('../terminal/screens');
const tty = require('../page/tty');

// Écrans qui comptent comme une page dans l'historique de l'onglet : ouvrir un de leurs
// résultats puis revenir en arrière les réaffiche.
const HISTORY_SCREENS = new Set(['results', 'ai', 'hist', 'fav']);

function navigate(tab, url) {
  const view = pageView.ensureView(tab);
  // La nouvelle page remplace l'ancienne : celle-ci n'est plus montrée pendant le chargement.
  const s = tab.screen;
  tab.pending = s && HISTORY_SCREENS.has(s.kind) ? { screen: { ...s, histAt: undefined }, numbered: tab.numbered, kind: tab.numberedKind } : null;
  tab.blank = true;
  tab.screen = tab.tty ? tty.ttyLoading(url) : null;
  tab.url = url;
  tab.title = shortUrl(url);
  view.webContents.loadURL(url).catch(() => unblank(tab));
  ui.layout();
  ui.sendState();
}

function unblank(tab) {
  if (!tab.blank) return;
  tab.blank = false;
  ui.layout();
  ui.sendState();
}

// Historique de l'onglet : l'écran (résultats, réponse de l'IA…) d'où l'on a ouvert l'entrée i
// est gardé dans tab.screenAt[i] ; « back » depuis l'entrée i le réaffiche avant d'aller à i - 1.
function recordNavigation(tab, wc) {
  const nh = wc.navigationHistory;
  const i = nh.getActiveIndex();
  const at = tab.screenAt || (tab.screenAt = {});
  for (const k of Object.keys(at)) if (Number(k) >= nh.length()) delete at[k];
  if (tab.pending !== undefined) {
    for (const k of Object.keys(at)) if (Number(k) > i) delete at[k];
    if (tab.pending) at[i] = tab.pending;
    else delete at[i];
    tab.pending = undefined;
  } else if (!tab.traversing && i === nh.length() - 1) delete at[i]; // lien suivi dans la page
  tab.traversing = false;
}

function showHistoryScreen(tab, k) {
  const e = tab.screenAt[k];
  screens.setScreen(tab, { ...e.screen, histAt: k }, e.numbered, e.kind);
}

function traverse(tab, dir) {
  tab.traversing = true;
  if (dir < 0) tab.view.webContents.navigationHistory.goBack();
  else tab.view.webContents.navigationHistory.goForward();
}

function hideScreen(tab) {
  tab.screen = null;
  ui.layout();
  ui.sendState();
}

function goBack(tab) {
  const s = tab.screen;
  const nh = tab.view && tab.view.webContents.navigationHistory;
  if (s && s.histAt !== undefined) {
    // Écran gardé entre les entrées k - 1 et k : on va à k - 1 (ou à l'accueil s'il n'y a rien avant).
    const w = nh.getActiveIndex();
    if (w === s.histAt - 1) return hideScreen(tab);
    if (w === s.histAt && nh.canGoBack()) {
      hideScreen(tab);
      return traverse(tab, -1);
    }
    return screens.showHome(tab);
  }
  if (s && tab.view && s.kind !== 'tty') {
    if (tab.tty) return tty.showTty(tab);
    return hideScreen(tab);
  }
  if (!tab.view) throw new Error(t('rien avant'));
  const w = nh.getActiveIndex();
  if (tab.screenAt && tab.screenAt[w]) return showHistoryScreen(tab, w);
  if (nh.canGoBack()) return traverse(tab, -1);
  return screens.showHome(tab);
}

function goForward(tab) {
  const s = tab.screen;
  const nh = tab.view && tab.view.webContents.navigationHistory;
  if (s && s.histAt !== undefined) {
    const w = nh.getActiveIndex();
    hideScreen(tab);
    if (w === s.histAt - 1) traverse(tab, 1);
    return undefined;
  }
  if (!nh || !nh.canGoForward()) throw new Error(t('rien après'));
  const next = nh.getActiveIndex() + 1;
  if (tab.screenAt && tab.screenAt[next] && !s) return showHistoryScreen(tab, next);
  if (!tab.tty) tab.screen = null;
  traverse(tab, 1);
  ui.layout();
  return undefined;
}

// Recharge la page et retire l'écran du terminal (résultats, aide…) qui pouvait la cacher.
// hard : sans le cache (Ctrl+Maj+R).
function reloadTab(tab, hard = false) {
  if (!tab.view) throw new Error(t('aucune page ouverte'));
  tab.screen = null;
  if (hard) tab.view.webContents.reloadIgnoringCache();
  else tab.view.webContents.reload();
  ui.layout();
  ui.sendState();
}

function zoom(delta) {
  const tab = tabList.activeTab();
  if (!tab.view) return;
  const wc = tab.view.webContents;
  wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
  ui.sendState();
}

Object.assign(module.exports, { navigate, unblank, recordNavigation, goBack, goForward, reloadTab, zoom });
