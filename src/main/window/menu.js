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
const K = require('../../shared/shortcuts');

// Raccourcis que l'on ne peut pas changer (souris, touches du terminal), montrés dans l'aide après les autres.
const FIXED = [
  [mark('Échap'), mark('rendre la main à la page')],
  [mark('clic droit sur +'), mark('onglets récents')],
  [mark('clic droit › Inspecter'), mark('outils de développement')],
  [mark('Ctrl+molette'), 'zoom'],
  ['↑ ↓ / Tab', mark('historique des commandes / autocomplétion')],
];

const keysOf = () => K.effective(state.settings.data.shortcuts);
const show = (accel) => K.display(accel, t('Maj'));

// « Ctrl+1…9 » quand les neuf raccourcis d'une série se suivent, sinon chacun.
function series(prefix, keys) {
  const firsts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => keys[`${prefix}-${n}`][0]);
  if (firsts.some((k) => !k)) return firsts.filter(Boolean).map(show).join(' / ');
  const base = firsts.map((k) => k.replace(/\d$/, ''));
  if (firsts.every((k, i) => k.endsWith(String(i + 1)) && base[i] === base[0])) return `${show(firsts[0])}…9`;
  return firsts.map(show).join(' / ');
}

// Liste de l'aide : [touches, description], d'après les raccourcis en vigueur.
function shortcutList() {
  const keys = keysOf();
  const rows = [];
  for (const s of K.SHORTCUTS) {
    if (s.n > 1) continue;
    if (s.n === 1) {
      const prefix = s.id.replace(/-1$/, '');
      rows.push([series(prefix, keys), t(s.label, { n: 'n' })]);
    } else if (keys[s.id].length) rows.push([keys[s.id].map(show).join(' / '), t(s.label)]);
  }
  return [...rows, ...FIXED.map(([k, d]) => [t(k), t(d)])];
}

// Touches affichées pour un raccourci (menus, info-bulles), ou '' s'il n'en a plus.
function keyLabel(id) {
  const k = keysOf()[id];
  return k && k.length ? show(k[0]) : '';
}

function buildMenu() {
  const act = (fn) => () => {
    try {
      fn();
    } catch (err) {
      output.print([{ t: `  ${err.message}`, c: 'err' }]);
    }
  };
  const panel = (kind) => () => state.win.webContents.send('ui:panel', kind);
  const ACTIONS = {
    terminal: () => output.focusTerminal(),
    history: act(() => commands.runCommand('hist')),
    clear: () => state.win.webContents.send('term:clear'),
    fullscreen: () => state.win.setFullScreen(!state.win.isFullScreen()),
    'new-tab': act(() => { tabList.createTab(); output.focusTerminal(); }),
    'close-tab': act(() => tabList.closeTab(tabList.activeTab())),
    'reopen-tab': act(() => tabList.reopenClosed(0)),
    'next-tab': act(() => tabList.cycleTab(1)),
    'prev-tab': act(() => tabList.cycleTab(-1)),
    back: act(() => navigation.goBack(tabList.activeTab())),
    forward: act(() => navigation.goForward(tabList.activeTab())),
    reload: act(() => navigation.reloadTab(tabList.activeTab())),
    'hard-reload': act(() => navigation.reloadTab(tabList.activeTab(), true)),
    find: () => findInPage.openFind(),
    bookmark: () => output.focusTerminal('add '),
    split: () => commands.runCommand(state.panes.length > 1 ? 'split off' : 'split'),
    'switch-pane': () => state.panes.length > 1 && commands.runCommand('focus'),
    devtools: act(() => devtools.toggleDevtools(tabList.activeTab())),
    inspect: act(() => devtools.inspectMode(tabList.activeTab())),
    downloads: panel('dl'),
    favorites: panel('fav'),
    extensions: panel('ext'),
    mobile: () => panels.togglePanel('mobile'),
    // Déjà ouverts dans un onglet : on y va ; sinon la commande settings.
    settings: act(() => {
      const open = state.tabs.find((tb) => tb.screen && tb.screen.kind === 'settings');
      if (open) tabList.selectTab(open);
      else commands.runCommand('settings');
    }),
    'settings-next': act(() => require('../commands/settings').cyclePage(tabList.activeTab(), 1) || tabList.cycleTab(1)),
    'settings-prev': act(() => require('../commands/settings').cyclePage(tabList.activeTab(), -1) || tabList.cycleTab(-1)),
    private: () => privateBrowsing.togglePrivate().catch((err) => output.print([{ t: `  ${err.message}`, c: 'err' }])),
    'zoom-in': () => navigation.zoom(0.5),
    'zoom-out': () => navigation.zoom(-0.5),
    'zoom-reset': () => navigation.zoom(0),
  };
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    ACTIONS[`tab-${n}`] = act(() => {
      if (!state.tabs[n - 1]) return;
      const inUi = state.win.webContents.isFocused();
      tabList.selectTab(state.tabs[n - 1]);
      tabList.focusShown(inUi);
    });
    ACTIONS[`ext-${n}`] = act(() => extPopup.openExtPopup(n));
  }
  // Un élément par touche : le premier raccourci est visible dans le menu, les autres cachés.
  const keys = keysOf();
  const items = [];
  for (const s of K.SHORTCUTS) {
    if (s.menu === false) continue;
    const label = s.n ? t(s.label, { n: s.n }) : t(s.label);
    keys[s.id].forEach((accelerator, i) => items.push({ label, accelerator, visible: !s.n && i === 0, click: ACTIONS[s.id] }));
  }
  const template = [
    {
      label: 'Zenith',
      submenu: [
        ...items,
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

Object.assign(module.exports, { shortcutList, keyLabel, buildMenu });
