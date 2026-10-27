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

// Ctrl+² (la touche sous Échap) : cache ou montre le terminal.
function toggleTerminal() {
  if (!state.win) return;
  state.win.webContents.focus();
  state.win.webContents.send('term:toggle');
}

// La touche sous Échap a un caractère différent selon le clavier (² en AZERTY, ` en QWERTY) :
// on la reconnaît à sa place, dans l'interface comme dans les pages.
function isToggleKey(input) {
  return input.type === 'keyDown' && input.code === 'Backquote' && (input.control || input.meta) && !input.alt && !input.shift;
}

Object.assign(module.exports, { print, focusTerminal, toggleTerminal, isToggleKey });
