'use strict';

const { Menu } = require('electron');
const { t, mark } = require('../../shared/i18n');
const state = require('../state');
const tabList = require('../tabs/tabs');
const extPopup = require('../extensions/popup');
const navigation = require('../tabs/navigation');
const output = require('../terminal/output');
const findInPage = require('../search/find-in-page');
const devtools = require('../devtools/devtools');
const privateBrowsing = require('../private/private');
const commands = require('../terminal/commands');
const panels = require('../panels/panels');

const SHORTCUTS = [
  ['Ctrl+H', mark('aller au terminal')],
  ['Ctrl+L', mark('vider le terminal')],
  ['Ctrl+J', mark('cacher / montrer le terminal')],
  ['F11', mark('plein écran')],
  [mark('Échap'), mark('rendre la main à la page')],
  ['Ctrl+T / Ctrl+W', mark('nouvel onglet / fermer l\'onglet')],
  [mark('Ctrl+Maj+T, clic droit sur +'), mark('rouvrir un onglet fermé / onglets récents')],
  ['Ctrl+Tab', mark('onglet suivant (Ctrl+1…9 : onglet n)')],
  ['Alt+← / Alt+→', mark('précédent / suivant')],
  ['F5', mark('recharger')],
  [mark('Ctrl+Maj+R'), mark('recharger sans le cache')],
  ['Ctrl+F / Ctrl+D', mark('chercher dans la page / ajouter aux favoris')],
  [mark('Ctrl+Maj+S / F6'), mark('split / changer d\'écran')],
  [mark('F12, clic droit › Inspecter'), mark('outils de développement')],
  ['Alt+1…9', mark('popup de l\'extension n')],
  [mark('Ctrl+Maj+J'), mark('téléchargements (ou le bouton ↓ de la barre du bas)')],
  [mark('Ctrl+Maj+B'), mark('favoris (ou le bouton ★ en bas à gauche)')],
  [mark('Ctrl+molette, Ctrl+= / Ctrl+-'), 'zoom'],
  ['↑ ↓ / Tab', mark('historique des commandes / autocomplétion')],
];

function buildMenu() {
  const act = (fn) => () => {
    try {
      fn();
    } catch (err) {
      output.print([{ t: `  ${err.message}`, c: 'err' }]);
    }
  };
  const template = [
    {
      label: 'Zenith',
      submenu: [
        { label: 'Terminal', accelerator: 'CmdOrCtrl+H', click: () => output.focusTerminal() },
        { label: t('Vider le terminal'), accelerator: 'CmdOrCtrl+L', click: () => state.win.webContents.send('term:clear') },
        { label: t('Cacher le terminal'), accelerator: 'CmdOrCtrl+J', click: () => { state.win.webContents.focus(); state.win.webContents.send('term:toggle'); } },
        { label: t('Plein écran'), accelerator: 'F11', click: () => state.win.setFullScreen(!state.win.isFullScreen()) },
        { label: t('Nouvel onglet'), accelerator: 'CmdOrCtrl+T', click: act(() => { tabList.createTab(); output.focusTerminal(); }) },
        { label: t('Fermer l\'onglet'), accelerator: 'CmdOrCtrl+W', click: act(() => tabList.closeTab(tabList.activeTab())) },
        { label: t('Rouvrir l\'onglet fermé'), accelerator: 'CmdOrCtrl+Shift+T', click: act(() => tabList.reopenClosed(0)) },
        { label: t('Onglet suivant'), accelerator: 'Ctrl+Tab', click: act(() => tabList.cycleTab(1)) },
        { label: t('Onglet précédent'), accelerator: 'Ctrl+Shift+Tab', click: act(() => tabList.cycleTab(-1)) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: t('Onglet {n}', { n }), accelerator: `CmdOrCtrl+${n}`, visible: false, click: act(() => state.tabs[n - 1] && tabList.selectTab(state.tabs[n - 1])),
        })),
        { label: t('Précédent'), accelerator: 'Alt+Left', click: act(() => navigation.goBack(tabList.activeTab())) },
        { label: t('Suivant'), accelerator: 'Alt+Right', click: act(() => navigation.goForward(tabList.activeTab())) },
        { label: t('Recharger'), accelerator: 'F5', click: act(() => navigation.reloadTab(tabList.activeTab())) },
        { label: t('Recharger'), accelerator: 'CmdOrCtrl+R', visible: false, click: act(() => navigation.reloadTab(tabList.activeTab())) },
        { label: t('Recharger sans le cache'), accelerator: 'CmdOrCtrl+Shift+R', click: act(() => navigation.reloadTab(tabList.activeTab(), true)) },
        { label: t('Chercher'), accelerator: 'CmdOrCtrl+F', click: () => findInPage.openFind() },
        { label: t('Ajouter aux favoris'), accelerator: 'CmdOrCtrl+D', click: () => output.focusTerminal('add ') },
        { label: 'Split', accelerator: 'CmdOrCtrl+Shift+S', click: () => commands.runCommand(state.panes.length > 1 ? 'split off' : 'split') },
        { label: t('Changer d\'écran'), accelerator: 'F6', click: () => state.panes.length > 1 && commands.runCommand('focus') },
        { label: t('Outils de développement'), accelerator: 'F12', click: act(() => devtools.toggleDevtools(tabList.activeTab())) },
        { label: t('Outils de développement'), accelerator: 'CmdOrCtrl+Shift+I', visible: false, click: act(() => devtools.toggleDevtools(tabList.activeTab())) },
        { label: t('Téléchargements'), accelerator: 'CmdOrCtrl+Shift+J', click: () => state.win.webContents.send('ui:panel', 'dl') },
        { label: t('Favoris'), accelerator: 'CmdOrCtrl+Shift+B', click: () => state.win.webContents.send('ui:panel', 'fav') },
        { label: 'Extensions', accelerator: 'CmdOrCtrl+Shift+E', click: () => state.win.webContents.send('ui:panel', 'ext') },
        { label: t('Mode mobile'), accelerator: 'CmdOrCtrl+Alt+M', click: () => panels.togglePanel('mobile') },
        { label: t('Navigation privée'), accelerator: 'CmdOrCtrl+Shift+N', click: () => privateBrowsing.togglePrivate().catch((err) => output.print([{ t: `  ${err.message}`, c: 'err' }])) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
          label: `Extension ${n}`, accelerator: `Alt+${n}`, visible: false, click: act(() => extPopup.openExtPopup(n)),
        })),
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => navigation.zoom(0.5) },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => navigation.zoom(0.5) },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: () => navigation.zoom(-0.5) },
        { label: t('Zoom normal'), accelerator: 'CmdOrCtrl+0', click: () => navigation.zoom(0) },
        { type: 'separator' },
        { role: 'quit', label: t('Quitter') },
      ],
    },
    {
      label: t('Édition'),
      submenu: [{ role: 'undo' }, { role: 'redo' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

Object.assign(module.exports, { SHORTCUTS, buildMenu });
