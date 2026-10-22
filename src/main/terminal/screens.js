'use strict';

const { app } = require('electron');
const os = require('os');
const fav = require('../../shared/favorites');
const { notesFor } = require('../../shared/changelog');
const { getLang } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');

function setScreen(tab, screen, numbered = [], kind = screen.kind) {
  tab.screen = screen;
  tab.numbered = numbered;
  tab.numberedKind = kind;
  ui.layout();
  ui.sendState();
}

function showHome(tab) {
  const recent = fav.recent(state.favorites.data.tree, 6);
  setScreen(
    tab,
    { kind: 'home', user: os.userInfo().username, recent: recent.map((r, i) => ({ n: i + 1, path: r.path, url: r.url })), changes: notesFor(app.getVersion(), getLang()) },
    recent.map((r) => ({ kind: 'url', url: r.url })),
  );
}

Object.assign(module.exports, { setScreen, showHome });
