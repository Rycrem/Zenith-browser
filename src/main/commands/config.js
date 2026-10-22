'use strict';

const { app, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../shared/config');
const { t, setLang } = require('../../shared/i18n');
const state = require('../state');
const theme = require('../window/theme');
const ui = require('../window/ui');
const screens = require('../terminal/screens');
const favs = require('../favorites/favorites');
const questions = require('../terminal/questions');
const lang = require('./lang');
const menu = require('../window/menu');

const CONFIG_FILTERS = () => [{ name: t('Configuration Zenith'), extensions: ['json'] }];

async function configCommand(sub, file, say) {
  if (sub !== 'export' && sub !== 'import') throw new Error('config export | import [fichier]');
  const target = file ? file.replace(/^~(?=$|[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1') : null;
  if (sub === 'export') {
    let out = target;
    if (!out) {
      const r = await dialog.showSaveDialog(state.win, { title: t('Exporter la configuration'), defaultPath: path.join(app.getPath('documents'), 'zenith-config.json'), filters: CONFIG_FILTERS() });
      if (r.canceled || !r.filePath) return say(t('  annulé'), 'dim');
      out = r.filePath;
    }
    const data = config.exportConfig({
      settings: state.settings.data,
      favorites: state.favorites.data.tree,
      extensions: state.exts.list.map((e) => ({ source: state.exts.updateSource(e), alias: e.alias, enabled: !!e.enabled, pinned: e.pinned !== false })).filter((e) => e.source),
      version: app.getVersion(),
    });
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    return say(t('  ✓ configuration exportée : {file} (sans les clés des IA)', { file: out }), 'ok');
  }
  let src = target;
  if (!src) {
    const r = await dialog.showOpenDialog(state.win, { title: t('Importer une configuration'), properties: ['openFile'], filters: CONFIG_FILTERS() });
    if (r.canceled || !r.filePaths.length) return say(t('  annulé'), 'dim');
    src = r.filePaths[0];
  }
  let data;
  try {
    data = config.parseConfig(fs.readFileSync(src, 'utf8'));
  } catch {
    throw new Error(t('{file} n\'est pas un fichier de configuration Zenith', { file: src }));
  }
  const missing = data.extensions.filter((e) => !state.exts.list.some((x) => state.exts.updateSource(x) === e.source));
  questions.ask(say, t('remplacer tes réglages{favs} par ceux de {file}{exts} ?', {
    file: path.basename(src),
    favs: data.favorites ? t(' et tes favoris') : '',
    exts: missing.length ? t(', et installer {count} extension(s)', { count: missing.length }) : '',
  }), async (s) => {
    Object.assign(state.settings.data, data.settings);
    state.settings.save();
    if (data.favorites) {
      state.favorites.data.tree = data.favorites;
      favs.saveFavorites();
    }
    setLang(lang.initialLang());
    menu.buildMenu();
    theme.setMode(theme.isLight());
    for (const e of missing) {
      try {
        const ext = await state.exts.add(e.source);
        if (e.alias) ext.alias = e.alias;
        if (e.pinned === false) ext.pinned = false;
        if (!e.enabled) await state.exts.setEnabled(state.exts.list.indexOf(ext) + 1, false);
        state.settings.save();
        s(t('  ✓ {name} installée', { name: ext.name }), 'ok');
      } catch (err) {
        s(t('  extension {id} : {error}', { id: e.source, error: err.message }), 'err');
      }
    }
    for (const tab of state.tabs) if (tab.screen && tab.screen.kind === 'home') screens.showHome(tab);
    ui.sendState();
    s(t('  ✓ configuration importée'), 'ok');
  }, false);
}

Object.assign(module.exports, { configCommand });
