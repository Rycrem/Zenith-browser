'use strict';

const state = require('../state');

function print(lines) {
  if (state.win && !state.win.isDestroyed()) state.win.webContents.send('term:print', lines);
}

function focusTerminal(prefill) {
  if (!state.win) return;
  state.win.webContents.focus();
  state.win.webContents.send('term:focus', prefill);
}

Object.assign(module.exports, { print, focusTerminal });
