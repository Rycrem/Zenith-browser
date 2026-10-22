'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { t, setLang } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const screens = require('../terminal/screens');
const menu = require('../window/menu');

// Réglage enregistré, sinon langue choisie dans l'installateur Windows, sinon celle du système.
function initialLang() {
  if (state.settings.data.lang === 'fr' || state.settings.data.lang === 'en') return state.settings.data.lang;
  if (app.isPackaged) {
    try {
      const v = fs.readFileSync(path.join(process.resourcesPath, 'default-lang'), 'utf8').trim();
      if (v === 'fr' || v === 'en') {
        // Gardée dans les réglages : une mise à jour silencieuse réinstalle sans ce choix.
        state.settings.data.lang = v;
        state.settings.save();
        return v;
      }
    } catch {
      // pas de fichier : installé autrement qu'avec l'installateur Windows
    }
  }
  return /^fr/i.test(app.getLocale()) ? 'fr' : 'en';
}

function langCommand(arg, say) {
  const lang = (arg || '').toLowerCase();
  if (!lang) {
    say(t('  langue : français (lang fr | en)'));
    return;
  }
  if (lang !== 'fr' && lang !== 'en') throw new Error('lang fr | en');
  state.settings.data.lang = lang;
  state.settings.save();
  setLang(lang);
  menu.buildMenu();
  for (const tab of state.tabs) if (tab.screen && tab.screen.kind === 'home') screens.showHome(tab);
  say(t('  ✓ langue : français'), 'ok');
  ui.sendState();
}

Object.assign(module.exports, { initialLang, langCommand });
