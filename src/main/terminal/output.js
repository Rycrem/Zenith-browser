'use strict';

const state = require('../state');
const K = require('../../shared/shortcuts');

function print(lines) {
  if (state.win && !state.win.isDestroyed()) state.win.webContents.send('term:print', lines);
}

// soft : le terminal caché le reste (la page garde le clavier), par exemple après la fermeture d'un onglet.
function focusTerminal(prefill, soft = false) {
  if (!state.win) return;
  state.win.webContents.focus();
  state.win.webContents.send('term:focus', prefill, soft);
}

// Ctrl+² (la touche sous Échap) : cache ou montre le terminal.
function toggleTerminal() {
  if (!state.win) return;
  state.win.webContents.focus();
  state.win.webContents.send('term:toggle');
}

// Cacher / montrer le terminal (Ctrl+² par défaut), lu à la main dans l'interface comme dans les
// pages : la touche sous Échap a un caractère différent selon le clavier (² en AZERTY, ` en QWERTY).
function isToggleKey(input) {
  if (input.type !== 'keyDown') return false;
  return K.effective(state.settings.data.shortcuts)['toggle-terminal'].some((k) => K.matches(input, k));
}

Object.assign(module.exports, { print, focusTerminal, toggleTerminal, isToggleKey });
