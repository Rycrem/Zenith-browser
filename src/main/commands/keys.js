'use strict';

const K = require('../../shared/shortcuts');
const { t } = require('../../shared/i18n');
const state = require('../state');
const menu = require('../window/menu');

const show = (accel) => K.display(accel, t('Maj'));
const nameOf = (s) => (s.n ? t(s.label, { n: s.n }) : t(s.label));

// « keys » : la liste ; « keys <raccourci> <touches | off | default> » ; « keys reset ».
// Les raccourcis choisis vont dans les réglages (shortcuts: { id: [touches] }) ; le menu est reconstruit.
function keysCommand(args, say) {
  const custom = state.settings.data.shortcuts || {};
  const save = () => {
    state.settings.data.shortcuts = custom;
    state.settings.save();
    menu.buildMenu();
  };
  if (!args.length) {
    const keys = K.effective(custom);
    for (const s of K.SHORTCUTS) say(`  ${s.id.padEnd(16)} ${(keys[s.id].map(show).join(' / ') || t('aucun')).padEnd(18)} ${nameOf(s)}`, custom[s.id] ? 'acc' : 'dim');
    say(t('  keys <raccourci> <touches> (ex. keys new-tab ctrl+maj+o) · off · default · keys reset'), 'dim');
    return;
  }
  if (args[0].toLowerCase() === 'reset') {
    for (const k of Object.keys(custom)) delete custom[k];
    save();
    say(t('  ✓ tous les raccourcis sont revenus à ceux par défaut'), 'ok');
    return;
  }
  const s = K.BY_ID[args[0].toLowerCase()];
  if (!s) throw new Error(t('raccourci inconnu : {name} (keys pour la liste)', { name: args[0] }));
  const want = args.slice(1).join('').trim();
  if (!want) {
    const keys = K.effective(custom)[s.id];
    say(`  ${nameOf(s)} : ${keys.map(show).join(' / ') || t('aucun')}`);
    return;
  }
  const low = want.toLowerCase();
  if (low === 'default' || low === 'defaut' || low === 'défaut') {
    delete custom[s.id];
    save();
    say(t('  ✓ {name} : {keys} (par défaut)', { name: nameOf(s), keys: s.keys.map(show).join(' / ') }), 'ok');
    return;
  }
  if (low === 'off' || low === 'aucun') {
    custom[s.id] = [];
    save();
    say(t('  ✓ {name} : plus de raccourci', { name: nameOf(s) }), 'ok');
    return;
  }
  const accel = K.normalize(want);
  if (!accel) throw new Error(t('touches non reconnues : {keys} (ex. ctrl+maj+o, alt+f2, f9)', { keys: want }));
  const other = K.conflict(custom, s.id, accel);
  if (other) throw new Error(t('{keys} est déjà pris par « {name} » : change-le d\'abord', { keys: show(accel), name: nameOf(other) }));
  custom[s.id] = [accel];
  save();
  say(t('  ✓ {name} : {keys}', { name: nameOf(s), keys: show(accel) }), 'ok');
}

// Lignes de la page « settings keys » : chaque raccourci, ses touches, un champ pour en taper d'autres.
function keysPage() {
  const custom = state.settings.data.shortcuts || {};
  const keys = K.effective(custom);
  return [
    ...K.SHORTCUTS.map((s) => ({
      label: nameOf(s).replace(/^./, (c) => c.toUpperCase()),
      hint: `${keys[s.id].map(show).join(' / ') || t('aucun')}${custom[s.id] ? '' : t(' · par défaut')}`,
      form: { template: `keys ${s.id} {0}`, fields: [{ type: 'keys', placeholder: t('touches…'), title: t('Clique ici puis appuie sur les touches (ou écris-les, puis Entrée)') }] },
      options: [
        ...(custom[s.id] ? [{ label: t('par défaut'), cmd: `keys ${s.id} default`, on: false }] : []),
        ...(keys[s.id].length ? [{ label: t('retirer'), cmd: `keys ${s.id} off`, on: false }] : []),
      ],
    })),
    { label: t('Tous les raccourcis'), options: [{ label: t('revenir à ceux par défaut'), cmd: 'keys reset', on: false }] },
  ];
}

Object.assign(module.exports, { keysCommand, keysPage });
