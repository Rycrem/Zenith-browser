'use strict';

const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const audio = require('../audio/audio');

function audioData() {
  return {
    title: t('son'),
    all: t('tout le navigateur'),
    volume: audio.globalVolume(),
    muted: !!state.settings.data.muteAll,
    empty: t('Aucun onglet ne joue de son.'),
    hint: t('clic sur le titre : aller à l\'onglet'),
    labels: { play: t('lecture'), pause: t('pause'), mute: t('couper le son'), unmute: t('remettre le son'), down: t('baisser'), up: t('monter') },
    tabs: audio.audioTabs().map((tb) => ({
      id: tb.id,
      n: state.tabs.indexOf(tb) + 1,
      title: tb.title || ui.hostOf(tb.url),
      host: ui.hostOf(tb.url),
      playing: tb.media === 'playing' || (!tb.media && tb.audible),
      audible: !!tb.audible,
      muted: audio.isMuted(tb),
      volume: audio.tabVolume(tb),
    })),
  };
}

function extData() {
  return {
    title: t('extensions'),
    hint: t('★ épingle l\'extension dans la barre du bas · « ext » pour les gérer'),
    empty: t('aucune extension (« ext add »)'),
    labels: { pin: t('Épingler dans la barre du bas'), unpin: t('Retirer de la barre du bas'), open: t('Ouvrir (Alt+{n})'), on: t('Activer'), off: t('Désactiver') },
    list: state.exts.summary(),
  };
}

function formatSize(bytes) {
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < 3) {
    n /= 1024;
    u++;
  }
  const num = n.toLocaleString(getLang() === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: u ? 1 : 0 });
  return [t('{n} o', { n: num }), t('{n} Ko', { n: num }), t('{n} Mo', { n: num }), t('{n} Go', { n: num })][u];
}

function formatEta(seconds) {
  if (seconds < 60) return t('{n} s restantes', { n: Math.max(1, Math.round(seconds)) });
  if (seconds < 3600) return t('{n} min restantes', { n: Math.round(seconds / 60) });
  return t('{n} h restantes', { n: Math.round(seconds / 360) / 10 });
}

function dlRow(d, i) {
  const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
  let label;
  if (d.state === 'completed') label = `${formatSize(d.received)} · ${t('terminé')}`;
  else if (d.state === 'progressing') {
    const parts = [d.total ? `${formatSize(d.received)} / ${formatSize(d.total)}` : formatSize(d.received)];
    if (d.paused) parts.push(t('en pause'));
    else if (d.speed) {
      parts.push(t('{speed}/s', { speed: formatSize(d.speed) }));
      if (d.total) parts.push(formatEta((d.total - d.received) / d.speed));
    }
    label = parts.join(' · ');
  } else label = d.state === 'cancelled' ? t('annulé') : t('interrompu');
  return { i, name: d.name, state: d.state, pct, label };
}

function dlData() {
  return {
    title: t('téléchargements'),
    rows: state.downloads.map(dlRow),
    empty: t('Aucun téléchargement.'),
    dir: t('ouvrir le dossier Téléchargements'),
    hint: t('Ctrl+Maj+J'),
    folder: t('dossier'),
    folderTitle: t('Afficher dans le dossier'),
    openTitle: t('Ouvrir le fichier'),
    cancelTitle: t('Annuler le téléchargement'),
    removeTitle: t('Retirer de la liste (le fichier reste)'),
  };
}

function favData() {
  const tab = tabList.activeTab();
  return {
    title: t('favoris'),
    tree: state.favorites.data.tree,
    current: tab && !tab.screen ? tab.url : '',
    empty: t('Aucun favori : « add nom » ajoute la page, « fav import » ceux d\'un autre navigateur.'),
    none: t('Aucun favori ne correspond.'),
    filter: t('filtrer…'),
    hint: t('Ctrl+Maj+B · Ctrl+clic : nouvel onglet · glisser pour ranger'),
    openTitle: t('ouvrir (Ctrl+clic : nouvel onglet)'),
  };
}

const PANELS = {
  dl: { file: 'downloads.html', width: 420, data: dlData },
  fav: { file: 'favorites.html', width: 380, data: favData },
  audio: { file: 'audio.html', width: 440, data: audioData },
  ext: { file: 'extensions.html', width: 360, data: extData },
};

Object.assign(module.exports, { PANELS });
