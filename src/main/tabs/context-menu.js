'use strict';

const { Menu, clipboard } = require('electron');
const { t } = require('../../shared/i18n');
const state = require('../state');
const tabList = require('./tabs');
const navigation = require('./navigation');
const split = require('../split/split');
const output = require('../terminal/output');
const devtools = require('../devtools/devtools');
const commands = require('../terminal/commands');

function showContextMenu(tab, p) {
  const wc = tab.view.webContents;
  const items = [
    { label: t('Précédent'), click: () => navigation.goBack(tab) },
    { label: t('Suivant'), enabled: wc.navigationHistory.canGoForward(), click: () => navigation.goForward(tab) },
    { label: t('Recharger'), click: () => wc.reload() },
    { type: 'separator' },
  ];
  if (p.linkURL) {
    items.push(
      { label: t('Ouvrir le lien dans un nouvel onglet'), click: () => tabList.createTab({ url: p.linkURL, background: true, opener: tab }) },
      { label: t('Ouvrir le lien dans l\'autre écran'), click: () => split.openInOtherPane(p.linkURL) },
      { label: t('Copier l\'adresse du lien'), click: () => clipboard.writeText(p.linkURL) },
      { label: t('Télécharger le lien'), click: () => wc.downloadURL(p.linkURL) },
      { type: 'separator' },
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: t('Enregistrer l\'image (dans Téléchargements)'), click: () => wc.downloadURL(p.srcURL) },
      { label: t('Ouvrir l\'image dans un nouvel onglet'), click: () => tabList.createTab({ url: p.srcURL, background: true, opener: tab }) },
      { label: t('Copier l\'image'), click: () => wc.copyImageAt(p.x, p.y) },
      { label: t('Copier l\'adresse de l\'image'), click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' },
    );
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL && !p.srcURL.startsWith('blob:')) {
    items.push(
      { label: p.mediaType === 'video' ? t('Enregistrer la vidéo (dans Téléchargements)') : t('Enregistrer le son (dans Téléchargements)'), click: () => wc.downloadURL(p.srcURL) },
      { label: p.mediaType === 'video' ? t('Copier l\'adresse de la vidéo') : t('Copier l\'adresse du son'), click: () => clipboard.writeText(p.srcURL) },
      { type: 'separator' },
    );
  }
  if (p.isEditable) {
    items.push({ role: 'cut', label: t('Couper') }, { role: 'copy', label: t('Copier') }, { role: 'paste', label: t('Coller') }, { type: 'separator' });
  } else if (p.selectionText) {
    const text = p.selectionText.trim();
    items.push(
      { role: 'copy', label: t('Copier') },
      { label: t('Rechercher « {text} »', { text: `${text.slice(0, 30)}${text.length > 30 ? '…' : ''}` }), click: () => commands.runCommand(`brows ${text}`) },
      { type: 'separator' },
    );
  }
  items.push(
    { label: t('Ajouter aux favoris…'), click: () => output.focusTerminal('add ') },
    { label: t('Code source de la page'), click: () => tabList.createTab({ url: `view-source:${tab.url}` }) },
    { type: 'separator' },
    { label: t('Inspecter'), click: () => devtools.openDevtools(tab, p.x, p.y) },
  );
  Menu.buildFromTemplate(items).popup({ window: state.win });
}

Object.assign(module.exports, { showContextMenu });
