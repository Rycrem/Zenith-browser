'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');
const tabList = require('./tabs');
const navigation = require('./navigation');

// Les onglets ouverts (pages seulement, hors navigation privée) remplacent la sauvegarde précédente.
function saveSession() {
  if (!state.sessionStore) return;
  const urls = state.tabs.filter((tb) => !tb.private && /^(https?|file):/.test(tb.url)).map((tb) => tb.url);
  if (!urls.length || JSON.stringify(urls) === JSON.stringify(state.sessionStore.data.tabs)) return;
  state.sessionStore.data.tabs = urls;
  state.sessionStore.save();
}

// « popback » : rouvre les onglets de la dernière fois ; l'accueil vide sert au premier.
function popback(tab) {
  if (!state.previousSession.length) throw new Error(t('aucun onglet de la dernière fois à rouvrir'));
  const urls = state.previousSession;
  state.previousSession = [];
  const reuse = !tab.view && tab.screen && tab.screen.kind === 'home';
  urls.forEach((url, i) => {
    if (i === 0 && reuse) navigation.navigate(tab, url);
    else tabList.createTab({ url, background: i > 0 || reuse });
  });
  return urls.length;
}

Object.assign(module.exports, { saveSession, popback });
