'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const chromeApis = require('../extensions/chrome-api');
const findInPage = require('../search/find-in-page');

function showInPane(tab, idx) {
  if (state.findWin && state.findWin.tabId !== tab.id && idx === state.activePane) findInPage.closeFind(false);
  // Onglet de l'autre côté : il change de côté, et son ancien écran affiche un autre de ses onglets.
  if (tabList.sideOf(tab) !== idx) {
    const other = tabList.paneOf(tab);
    tab.side = idx;
    tabList.sortSides();
    if (other >= 0) state.panes[other].tabId = tabList.replacement(other, tab).id;
  }
  state.panes[idx].tabId = tab.id;
  state.activePane = idx;
  if (tab.view?.webContents) tabList.apiOf(tab).selectTab(tab.view.webContents);
  chromeApis.highlightForExtensions(tab);
  ui.layout();
  ui.sendState();
}

function closePane(idx) {
  if (state.panes.length === 1) throw new Error(t('pas de split en cours'));
  const keep = state.panes[1 - idx];
  state.panes.splice(0, state.panes.length, keep);
  for (const tb of state.tabs) tb.side = 0;
  state.activePane = 0;
  ui.layout();
  ui.sendState();
}

function openInOtherPane(url) {
  if (state.panes.length === 1) state.panes.push({ tabId: null });
  const target = state.activePane === 0 ? 1 : 0;
  const tab = tabList.createTab({ url, background: true, pane: target });
  showInPane(tab, target);
}

Object.assign(module.exports, { showInPane, closePane, openInOtherPane });
