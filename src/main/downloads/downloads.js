'use strict';

const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const panels = require('../panels/panels');
const screens = require('../terminal/screens');
const output = require('../terminal/output');

function showDl(tab) {
  const rows = state.downloads.map((d, i) => ({ n: i + 1, name: d.name, state: d.state, received: d.received, total: d.total, path: d.path }));
  screens.setScreen(tab, { kind: 'dl', rows }, state.downloads.map((d) => ({ kind: 'dl', path: d.path })));
}

// Pendant le téléchargement, le fichier n'existe pas encore sous son nom (Chromium écrit un
// .crdownload) : showItemInFolder ne ferait rien, on ouvre alors le dossier.
function showInFolder(file) {
  if (fs.existsSync(file)) shell.showItemInFolder(file);
  else shell.openPath(path.dirname(file));
}

function setupDownloads(s = state.ses) {
  s.on('will-download', (e, item, wc) => state.inWindow(state.windowOf(wc), () => {
    // Enregistrement direct dans Téléchargements, sans boîte de dialogue.
    const dir = app.getPath('downloads');
    const parsed = path.parse(item.getFilename());
    let file = path.join(dir, parsed.base);
    for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${parsed.name} (${i})${parsed.ext}`);
    item.setSavePath(file);
    const d = { name: path.basename(file), path: file, url: item.getURL(), state: 'progressing', received: 0, total: item.getTotalBytes(), item, startedAt: Date.now() };
    state.downloads.unshift(d);
    output.print([{ t: t('  ↓ téléchargement de {name} (dl ou Ctrl+J pour suivre)', { name: d.name }), c: 'dim' }]);
    ui.sendStateAll();
    panels.sendDl();
    // Il s'affiche seul au-dessus du bouton ↓ ; un clic ailleurs le ferme.
    if (!state.panel || state.panel.win.isDestroyed()) state.win.webContents.send('ui:panel', 'dlnew');
    let last = { time: Date.now(), bytes: 0 };
    let refreshed = 0;
    item.on('updated', () => {
      d.received = item.getReceivedBytes();
      d.total = item.getTotalBytes();
      d.paused = item.isPaused();
      // Vitesse lissée, mesurée sur au moins une demi-seconde.
      const now = Date.now();
      if (now - last.time >= 500) {
        const speed = ((d.received - last.bytes) * 1000) / (now - last.time);
        d.speed = d.speed ? d.speed * 0.6 + speed * 0.4 : speed;
        last = { time: now, bytes: d.received };
      }
      // Le bouton ↓ de chaque fenêtre suit l'avancement.
      if (now - refreshed >= 250) {
        refreshed = now;
        panels.sendDl();
        ui.sendStateAll();
      }
    });
    item.once('done', (ev, done) => {
      d.state = done;
      d.received = item.getReceivedBytes();
      d.item = null;
      const msg = { completed: t('  ✓ {name} téléchargé', { name: d.name }), cancelled: t('  ✗ {name} annulé', { name: d.name }) }[done] || t('  ✗ {name} interrompu', { name: d.name });
      output.print([{ t: msg, c: done === 'completed' ? 'ok' : 'err' }]);
      const tab = tabList.activeTab();
      if (tab.screen && tab.screen.kind === 'dl') showDl(tab);
      ui.sendStateAll();
      panels.sendDl();
    });
  }));
}

function refresh() {
  const tab = tabList.activeTab();
  if (tab.screen && tab.screen.kind === 'dl') showDl(tab);
  ui.sendState();
  panels.sendDl();
}

// Arrête le téléchargement : Chromium supprime alors le fichier partiel (.crdownload).
function cancelDownload(d) {
  if (d.state !== 'progressing' || !d.item) throw new Error(t('ce téléchargement est déjà fini'));
  d.item.cancel();
}

// Retire un téléchargement fini de la liste ; le fichier reste dans Téléchargements.
function removeDownload(d) {
  if (d.state === 'progressing') throw new Error(t('téléchargement en cours : « dl cancel n » l\'arrête d\'abord'));
  state.downloads.splice(state.downloads.indexOf(d), 1);
  refresh();
}

Object.assign(module.exports, { showDl, showInFolder, setupDownloads, cancelDownload, removeDownload });
