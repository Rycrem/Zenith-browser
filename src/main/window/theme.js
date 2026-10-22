'use strict';

const { nativeTheme } = require('electron');
const state = require('../state');
const ui = require('./ui');

const THEMES = { ambre: '#F2A541', vert: '#7FD18B', cyan: '#6CC5D9', rose: '#E07AA8', violet: '#B48CF2' };

const PRIVATE_ACCENT = '#E5484D';
const accentColor = () => (state.privateMode ? PRIVATE_ACCENT : THEMES[state.settings.data.theme] || THEMES.ambre);

// Mode nuit (par défaut) ou jour : l'interface, et les sites qui suivent prefers-color-scheme.
const isLight = () => state.settings.data.mode === 'jour';

function setMode(light) {
  state.settings.data.mode = light ? 'jour' : 'nuit';
  state.settings.save();
  nativeTheme.themeSource = light ? 'light' : 'dark';
  if (state.win && !state.win.isDestroyed()) state.win.setBackgroundColor(light ? '#F6F7F9' : '#0E1116');
  if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
  ui.sendState();
}

Object.assign(module.exports, { THEMES, accentColor, isLight, setMode });
