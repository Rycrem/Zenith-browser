'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const journal = require('../storage/log');
const state = require('../state');
const theme = require('./theme');
const ui = require('./ui');
const tabList = require('../tabs/tabs');
const navigation = require('../tabs/navigation');
const suggestions = require('../history/suggest');

// Position de la fenêtre gardée d'un lancement à l'autre, si elle tombe encore sur un écran branché.
function savedBounds() {
  const w = state.settings.data.window;
  if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !(w.width > 0) || !(w.height > 0)) return {};
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) => w.x < a.x + a.width - 80 && w.x + w.width > a.x + 80 && w.y >= a.y - 20 && w.y < a.y + a.height - 80);
  return onScreen ? { x: w.x, y: w.y, width: w.width, height: w.height } : {};
}

// La fenêtre de l'état en cours (state.inWindow). bounds : position voulue (onglet détaché),
// sinon celle gardée du dernier lancement. inactive : montrée sans prendre le focus.
function createWindow(bounds, inactive = false) {
  // Les onglets montent dans la barre de titre, noire, à côté des boutons de la fenêtre.
  const mac = process.platform === 'darwin';
  const own = state.current();
  state.win = new BrowserWindow({
    width: 1280,
    height: 820,
    ...(bounds || savedBounds()),
    show: !inactive,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: theme.isLight() ? '#F6F7F9' : '#0E1116',
    title: 'Zenith',
    titleBarStyle: 'hidden',
    ...(mac ? { trafficLightPosition: { x: 12, y: 13 } } : { titleBarOverlay: { color: '#000000', symbolColor: '#D6DEE8', height: 40 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true },
  });
  // Ses événements se traitent dans son propre état.
  state.bindEmitter(state.win, () => own);
  state.bindEmitter(state.win.webContents, () => own);
  state.win.setMenuBarVisibility(false);
  if (!bounds && state.settings.data.window && state.settings.data.window.maximized) state.win.maximize();
  state.win.on('focus', () => state.setFocused(own));
  if (inactive) state.win.showInactive();
  state.win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  // Les erreurs et les blocages de l'interface vont dans le journal ; bloquée, elle est relancée.
  state.win.webContents.on('console-message', (e) => {
    if (e.level === 'error') journal.log(`interface : ${e.message} (${path.basename(e.sourceId || '')}:${e.lineNumber})`);
  });
  let hung = null;
  state.win.webContents.on('unresponsive', () => {
    journal.log('interface bloquée');
    hung = setTimeout(() => {
      journal.log('interface toujours bloquée : relancée');
      if (!state.win.isDestroyed()) state.win.webContents.forcefullyCrashRenderer();
    }, 5000);
  });
  state.win.webContents.on('responsive', () => {
    clearTimeout(hung);
    journal.log('interface débloquée');
  });
  // Réduite puis rouverte, la fenêtre revient sur l'écran où elle était, pas sur l'écran principal.
  let beforeMinimize = null;
  state.win.on('minimize', () => {
    beforeMinimize = { normal: state.win.getNormalBounds(), display: screen.getDisplayMatching(state.win.getBounds()).id };
  });
  state.win.on('restore', () => {
    const m = beforeMinimize;
    beforeMinimize = null;
    if (!m || state.win.isFullScreen() || screen.getDisplayMatching(state.win.getBounds()).id === m.display) return;
    const maximized = state.win.isMaximized();
    if (maximized) state.win.unmaximize();
    state.win.setBounds(m.normal);
    if (maximized) state.win.maximize();
  });
  state.win.on('close', () => {
    if (state.allWindows()[0] !== own) return; // la position gardée est celle de la première fenêtre
    const b = state.win.getNormalBounds();
    state.settings.data.window = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: state.win.isMaximized() };
    state.settings.save();
  });
  state.win.on('resize', () => {
    suggestions.hideSuggest();
    if (state.fullTab) ui.layout();
  });
  state.win.on('move', () => {
    suggestions.hideSuggest();
    ui.layout();
  });
  // Boutons précédent / suivant de la souris (Windows).
  state.win.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward') navigation.mouseNav(-1);
    else if (cmd === 'browser-forward') navigation.mouseNav(1);
  });
  // Ctrl+Tab passe avant le terminal, qui garderait sinon Tab pour l'autocomplétion.
  state.win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Tab' || !input.control || input.alt || input.meta) return;
    e.preventDefault();
    tabList.cycleTab(input.shift ? -1 : 1);
  });
  // F11 ou la fenêtre qui sort du plein écran : la vidéo en sort aussi.
  state.win.on('leave-full-screen', () => {
    if (!state.fullTab) return;
    state.fullSetWin = false;
    const wc = state.fullTab.view.webContents;
    ui.setHtmlFullscreen(state.fullTab, false);
    wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
  });
  // Fermée : ses onglets avec elle. La dernière fenêtre fermée quitte l'appli (window-all-closed).
  state.win.on('closed', () => {
    state.win = null;
    for (const tb of state.tabsOf(own)) {
      for (const v of [tb.view, tb.dev]) if (v && v.webContents && !v.webContents.isDestroyed()) v.webContents.close();
      if (tb.devWin && !tb.devWin.isDestroyed()) tb.devWin.close();
    }
    state.removeWindow(own);
  });
}

Object.assign(module.exports, { createWindow });
