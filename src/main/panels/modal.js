'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('../state');
const theme = require('../window/theme');

const WIDTH = 460;

// Question oui/non au milieu de la fenêtre, aux couleurs de Zenith : la boîte du système ne suit
// ni l'accent, ni le mode nuit ou jour, ni la navigation privée. Vaut true pour le bouton principal,
// false pour Annuler, Échap ou la fenêtre fermée.
function confirmModal({ title, message, detailLabel, details, ok, cancel }) {
  if (state.modal && !state.modal.win.isDestroyed()) state.modal.win.close();
  return new Promise((resolve) => {
    const b = state.win.getContentBounds();
    const place = (height) => ({ x: b.x + Math.round((b.width - WIDTH) / 2), y: b.y + Math.max(40, Math.round((b.height - height) / 3)), width: WIDTH, height });
    const mw = new BrowserWindow({
      ...place(160),
      parent: state.win,
      modal: true,
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: theme.isLight() ? '#F6F7F9' : state.privateMode ? '#1A1024' : '#0E1116',
      webPreferences: { preload: path.join(__dirname, 'panel-preload.js'), sandbox: true, contextIsolation: true },
    });
    let answer = false;
    state.modal = {
      win: mw,
      place,
      answer(yes) {
        answer = yes;
        if (!mw.isDestroyed()) mw.close();
      },
    };
    mw.loadFile(path.join(__dirname, '../../renderer/panels/modal.html'), { query: { accent: theme.accentColor(), mode: theme.isLight() ? 'jour' : 'nuit', private: state.privateMode ? '1' : '' } });
    mw.webContents.once('did-finish-load', () => mw.webContents.send('panel:data', { title, message, detailLabel, details, ok, cancel }));
    mw.on('closed', () => {
      if (state.modal && state.modal.win === mw) state.modal = null;
      resolve(answer);
    });
  });
}

function modalAction(action) {
  state.modal.answer(action === 'ok');
}

// La hauteur arrive avec le contenu : la fenêtre s'affiche à sa taille, sans sauter.
function modalSize(height) {
  const m = state.modal;
  m.win.setBounds(m.place(Math.min(Math.max(Math.ceil(height), 80), 480)));
  if (!m.win.isVisible()) m.win.show();
}

Object.assign(module.exports, { confirmModal, modalAction, modalSize });
