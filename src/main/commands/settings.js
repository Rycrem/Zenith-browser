'use strict';

const C = require('../../shared/commands');
const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const theme = require('../window/theme');
const screens = require('../terminal/screens');
const updates = require('../updates/update-command');

// Page des réglages (« settings », bouton ⚙ en bas à droite) : chaque choix lance sa commande.
function showSettings(tab) {
  const d = state.settings.data;
  const opt = (label, cmd, on) => ({ label, cmd, on });
  const light = theme.isLight();
  const gpu = d.gpu !== false;
  const auto = updates.autoUpdateOn();
  const rows = [
    { label: t('Mode'), options: [opt(t('nuit'), 'mode nuit', !light), opt(t('jour'), 'mode jour', light)] },
    { label: t('Couleur d\'accent'), options: Object.keys(theme.THEMES).map((k) => opt(k, `theme ${k}`, d.theme === k)) },
    { label: t('Langue'), options: [opt('français', 'lang fr', getLang() === 'fr'), opt('English', 'lang en', getLang() === 'en')] },
    { label: t('Moteur de recherche'), options: Object.entries(C.ENGINES).map(([k, e]) => opt(e.label, `engine ${k}`, d.engine === k)) },
    { label: t('Mises à jour automatiques'), options: [opt(t('activées'), 'update auto on', auto), opt(t('désactivées'), 'update auto off', !auto)] },
    { label: t('Accélération matérielle'), hint: t('relance Zenith'), options: [opt(t('activée'), 'gpu on', gpu), opt(t('désactivée'), 'gpu off', !gpu)] },
  ];
  const actions = [
    opt(t('IA de « ia »'), 'ia'),
    opt(t('Alias'), 'alias'),
    opt(t('Autorisations des sites'), 'perm'),
    opt(t('Navigateur par défaut'), 'default'),
    opt(t('Exporter les réglages'), 'config export'),
    opt(t('Importer des réglages'), 'config import'),
    opt(t('Mises à jour'), 'update'),
  ];
  screens.setScreen(tab, { kind: 'settings', rows, actions });
}

// Après une commande lancée depuis la page, elle montre les nouveaux choix.
function refreshSettings(tab) {
  if (tab && tab.screen && tab.screen.kind === 'settings') showSettings(tab);
}

Object.assign(module.exports, { showSettings, refreshSettings });
