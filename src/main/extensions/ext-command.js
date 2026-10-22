'use strict';

const { t } = require('../../shared/i18n');
const { storeExtensionId } = require('../../shared/crx');
const state = require('../state');
const ui = require('../window/ui');
const extPopup = require('./popup');
const screens = require('../terminal/screens');
const output = require('../terminal/output');
const extLogs = require('./logs');
const questions = require('../terminal/questions');

function showExt(tab) {
  const rows = state.exts.summary();
  screens.setScreen(tab, { kind: 'ext', rows }, rows.map((r) => ({ kind: 'ext', n: r.n })));
}

async function extCommand(tab, args, say) {
  const sub = args[0];
  const n = Number(args[1]);
  if (!sub) {
    showExt(tab);
    return;
  }
  if (/^\d+$/.test(sub)) {
    extPopup.openExtPopup(Number(sub));
    return;
  }
  switch (sub) {
    case 'add': {
      // Sans argument, installe l'extension de la page du Chrome Web Store ouverte.
      const source = args[1] ? args.slice(1).join(' ') : storeExtensionId(tab.url || '');
      if (!source) throw new Error(t('ext add <lien du Chrome Web Store | identifiant | dossier | ublock>, ou « ext add » seul sur la page de l\'extension'));
      output.print([{ t: t('  installation de l\'extension…'), c: 'dim' }]);
      const ext = await state.exts.add(source);
      say(t('  ✓ {name} installée, alias « {alias} »', { name: ext.name, alias: ext.alias }) + (ext.popup ? '' : t(' (pas de popup)')), 'ok');
      if (ext.dnrOnly) say(t('  ⚠ cette extension bloque avec declarativeNetRequest, qu\'Electron ne gère pas : elle ne bloquera rien. Pour bloquer les pubs : uBlock Origin (« ext add ublock »).'), 'warn');
      break;
    }
    case 'on':
    case 'off': {
      const ext = await state.exts.setEnabled(n, sub === 'on');
      say(sub === 'on' ? t('  ✓ {alias} activée', { alias: ext.alias }) : t('  ✓ {alias} désactivée', { alias: ext.alias }), 'ok');
      break;
    }
    case 'pin': {
      const ext = state.exts.pin(n);
      say(ext.pinned === false ? t('  ✓ {alias} retirée de la barre du bas', { alias: ext.alias }) : t('  ✓ {alias} épinglée dans la barre du bas', { alias: ext.alias }), 'ok');
      ui.sendState();
      break;
    }
    case 'rm': {
      const ext = state.exts.get(n);
      questions.ask(say, t('désinstaller {name} ?', { name: ext.name }), async (s) => {
        state.exts.remove(n);
        s(t('  ✓ extension désinstallée'), 'ok');
        if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
        ui.sendState();
      });
      return;
    }
    case 'log':
      extLogs.extLogCommand(args.slice(1).join(' '), say);
      break;
    case 'alias':
      state.exts.rename(n, args[2]);
      say(t('  ✓ alias : {alias}', { alias: args[2] }), 'ok');
      break;
    default:
      throw new Error('ext [add | on | off | rm | alias | n]');
  }
  if (tab.screen && tab.screen.kind === 'ext') showExt(tab);
  ui.sendState();
}

Object.assign(module.exports, { extCommand });
