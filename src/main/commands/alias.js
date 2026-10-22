'use strict';

const C = require('../../shared/commands');
const { t } = require('../../shared/i18n');
const state = require('../state');
const screens = require('../terminal/screens');

function aliasCommand(tab, text, say) {
  const aliases = state.settings.data.aliases;
  if (!text) {
    screens.setScreen(tab, { kind: 'alias', rows: Object.entries(aliases).map(([k, v]) => ({ name: k, value: v })) });
    return;
  }
  const m = text.match(/^(\S+)\s*(?:=\s*)?(.*)$/);
  const key = m[1];
  const value = m[2].trim();
  if (!value) {
    if (!aliases[key]) throw new Error(t('pas d\'alias « {name} »', { name: key }));
    say(`  ${key} = ${aliases[key]}`);
    return;
  }
  if (C.COMMAND_NAMES.includes(key)) throw new Error(t('« {name} » est déjà une commande', { name: key }));
  aliases[key] = value;
  state.settings.save();
  say(`  ✓ alias ${key} = ${value}`, 'ok');
}

Object.assign(module.exports, { aliasCommand });
