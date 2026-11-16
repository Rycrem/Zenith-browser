'use strict';

const { nativeTheme } = require('electron');
const state = require('../state');
const ui = require('./ui');

const THEMES = { ambre: '#F2A541', vert: '#7FD18B', cyan: '#6CC5D9', rose: '#E07AA8', violet: '#B48CF2' };

const PRIVATE_ACCENT = '#E5484D';
const custom = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);
const accentColor = () => (state.privateMode ? PRIVATE_ACCENT : THEMES[state.settings.data.theme] || custom(state.settings.data.theme) || THEMES.ambre);

// Mode nuit (par défaut), jour, ou « systeme » qui suit le thème clair/sombre de Windows (désactivé par défaut) :
// l'interface, et les sites qui suivent prefers-color-scheme.
const followsSystem = () => state.settings.data.mode === 'systeme';
const isLight = () => (followsSystem() ? !nativeTheme.shouldUseDarkColors : state.settings.data.mode === 'jour');

// Toutes les fenêtres : fond, popup ouverte (refermée, ses couleurs sont fixées à l'ouverture), interface et page des réglages.
function applyMode() {
  const light = isLight();
  const { refreshSettings } = require('../commands/settings'); // ici : require circulaire sinon
  for (const w of state.allWindows()) {
    state.inWindow(w, () => {
      if (state.win && !state.win.isDestroyed()) state.win.setBackgroundColor(light ? '#F6F7F9' : '#0E1116');
      if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
      for (const tab of state.tabs) refreshSettings(tab);
      ui.sendState();
    });
  }
}

// mode : 'nuit', 'jour' ou 'systeme'.
function setMode(mode) {
  state.settings.data.mode = mode;
  state.settings.save();
  nativeTheme.themeSource = mode === 'systeme' ? 'system' : mode === 'jour' ? 'light' : 'dark';
  applyMode();
}

// Windows passe en clair ou en sombre : Zenith suit, s'il suit le système.
nativeTheme.on('updated', () => {
  if (state.settings && followsSystem()) applyMode();
});

Object.assign(module.exports, { THEMES, accentColor, isLight, followsSystem, setMode });
