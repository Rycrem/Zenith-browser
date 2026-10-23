'use strict';

const { ipcMain, clipboard } = require('electron');
const { getLang } = require('../../shared/i18n');
const state = require('../state');
const theme = require('./theme');
const ui = require('./ui');
const tabList = require('../tabs/tabs');
const extPopup = require('../extensions/popup');
const panels = require('../panels/panels');
const modal = require('../panels/modal');
const pageView = require('../tabs/page-view');
const webStore = require('../extensions/web-store');
const navigation = require('../tabs/navigation');
const split = require('../split/split');
const output = require('../terminal/output');
const suggestions = require('../history/suggest');
const findInPage = require('../search/find-in-page');
const devtools = require('../devtools/devtools');
const audio = require('../audio/audio');
const panelData = require('../panels/panel-data');
const commands = require('../terminal/commands');
const aiCommands = require('../ai/ai-command');
const updates = require('../updates/update-command');
const completion = require('../terminal/completion');

function setupIpc() {
  // Les canaux ui:* ne répondent qu'à l'interface d'une fenêtre, jamais à une page ou une
  // extension ; ils s'appliquent à cette fenêtre.
  const uiWindow = (e) => state.allWindows().find((w) => w.win && !w.win.isDestroyed() && e.sender === w.win.webContents);
  const onUi = (channel, fn) => ipcMain.on(channel, (e, ...args) => {
    const w = uiWindow(e);
    if (w) state.inWindow(w, () => fn(e, ...args));
    else e.returnValue = null;
  });
  const handleUi = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
    const w = uiWindow(e);
    if (!w) throw new Error('refused');
    return state.inWindow(w, () => fn(e, ...args));
  });
  // Les popups (panneaux, recherche, suggestions…) parlent pour la fenêtre qui les a ouvertes.
  const onPopup = (channel, fn) => ipcMain.on(channel, (e, ...args) => state.inWindow(state.windowOf(e.sender), () => fn(e, ...args)));
  onUi('ui:layout', (e, r) => {
    state.rects = r.map((x) => x && { x: Math.round(x.x), y: Math.round(x.y), width: Math.round(x.width), height: Math.round(x.height) });
    ui.layout();
  });
  onUi('ui:drag', (e, on) => {
    state.dragging = !!on;
    ui.layout();
  });
  handleUi('ui:exec', (e, line, opts) => {
    state.lastCommandAt = Date.now();
    // La commande tapée sous un écran s'applique à cet écran.
    if (opts && Number.isInteger(opts.pane) && state.panes[opts.pane] && opts.pane !== state.activePane) {
      state.activePane = opts.pane;
      ui.sendState();
    }
    // Ctrl+Entrée : un nouvel onglet d'abord, la commande s'y exécute (pas pour répondre à une question).
    if (opts && opts.newTab && String(line).trim() && !state.prompts.length) tabList.createTab();
    return commands.exec(String(line));
  });
  onUi('ui:zoom-reset', () => navigation.zoom(0));
  // La ligne « > » sous une réponse de l'IA continue la discussion.
  onUi('ui:ai-reply', (e, text) => {
    const tab = tabList.activeTab();
    const q = String(text || '').trim();
    if (!q || !tab.screen || tab.screen.kind !== 'ai' || !tab.screen.done) return;
    state.lastCommandAt = Date.now();
    aiCommands.aiAsk(tab, q, tab.screen, (l, c) => output.print([{ t: l, c }]));
  });
  onUi('ui:recent-menu', () => tabList.recentMenu());
  onUi('ui:find-result', (e, r) => {
    if (state.findWin && state.findWin.screen && !state.findWin.win.isDestroyed() && r) state.findWin.win.webContents.send('panel:data', { ordinal: Number(r.ordinal) || 0, matches: Number(r.matches) || 0 });
  });
  onUi('ui:lang', (e) => {
    e.returnValue = getLang();
  });
  handleUi('ui:complete', (e, line) => completion.complete(String(line)));
  handleUi('ui:clipboard-read', () => clipboard.readText());
  onUi('ui:clipboard-write', (e, text) => clipboard.writeText(String(text)));
  let started = false;
  onUi('ui:ready', () => {
    ui.sendState();
    if (!started) {
      started = true;
      updates.startupUpdateNotes();
    }
  });
  onUi('ui:focus-page', () => {
    state.lastCommandAt = 0;
    const tab = tabList.activeTab();
    if (tab.screen && tab.view) {
      tab.screen = null;
      ui.layout();
      ui.sendState();
    }
    if (tab.view && !tab.screen) tab.view.webContents.focus();
  });
  onUi('ui:tab', (e, id) => {
    const t = tabList.getTab(id);
    if (t) tabList.selectTab(t);
  });
  // gap : indice de l'onglet devant lequel poser celui qu'on déplace (tabs.length : à la fin).
  onUi('ui:tab-move', (e, id, gap) => {
    const from = state.tabs.findIndex((t) => t.id === id);
    if (from < 0 || !Number.isInteger(gap) || gap < 0 || gap > state.tabs.length) return;
    const to = gap > from ? gap - 1 : gap;
    if (to === from) return;
    state.tabs.splice(to, 0, state.tabs.splice(from, 1)[0]);
    tabList.sortSides();
    ui.sendState();
  });
  // Onglet glissé dans la barre de l'autre écran, à la place pos parmi ses onglets. S'il était le
  // dernier de son écran, le split se termine.
  onUi('ui:tab-to-pane', (e, id, idx, pos) => {
    const tab = tabList.getTab(id);
    if (!tab || state.panes.length < 2 || (idx !== 0 && idx !== 1) || tabList.sideOf(tab) === idx || !Number.isInteger(pos) || pos < 0) return;
    const from = tabList.sideOf(tab);
    const targets = state.tabs.filter((tb) => tabList.sideOf(tb) === idx);
    if (state.tabs.some((tb) => tb !== tab && tabList.sideOf(tb) === from)) split.showInPane(tab, idx);
    else {
      state.panes[idx].tabId = tab.id;
      split.closePane(from);
    }
    state.tabs.splice(state.tabs.indexOf(tab), 1);
    const anchor = targets[pos];
    state.tabs.splice(anchor ? state.tabs.indexOf(anchor) : state.tabs.indexOf(targets[targets.length - 1]) + 1, 0, tab);
    tabList.sortSides();
    ui.sendState();
  });
  // Onglet glissé hors de la barre : il part dans sa propre fenêtre, qui suit la souris jusqu'au
  // relâchement (ox, oy : place de la souris dans cette fenêtre). Lâché sur la barre d'onglets
  // d'une autre fenêtre, il y entre.
  let tabDrag = null; // { tab, w, ox, oy }
  const inTabBar = (win, x, y) => {
    const b = win.getContentBounds();
    return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + 44;
  };
  onUi('ui:tab-detach', (e, id, sx, sy, ox, oy) => {
    const tab = tabList.getTab(id);
    if (!tab || ![sx, sy, ox, oy].every(Number.isFinite)) return;
    const b = state.win.getBounds();
    const w = tabList.detachTab(tab, { x: Math.round(sx - ox), y: Math.round(sy - oy), width: b.width, height: b.height }, true);
    if (w && w.win) {
      if (w.win.isMaximized()) w.win.unmaximize();
      tabDrag = { tab, w, ox, oy };
    }
  });
  onUi('ui:tab-drag-move', (e, sx, sy) => {
    const d = tabDrag;
    if (d && d.w.win && !d.w.win.isDestroyed() && Number.isFinite(sx) && Number.isFinite(sy)) d.w.win.setPosition(Math.round(sx - d.ox), Math.round(sy - d.oy));
  });
  onUi('ui:tab-drop', (e, id, sx, sy) => {
    const drag = tabDrag;
    tabDrag = null;
    const tab = state.allTabs().find((tb) => tb.id === id);
    if (!tab || !Number.isFinite(sx) || !Number.isFinite(sy)) return;
    const own = state.windowOfTab(tab);
    const target = state.allWindows().find((w) => w !== own && w.win && !w.win.isDestroyed() && w.win.isVisible() && !w.win.isMinimized() && inTabBar(w.win, sx, sy));
    if (target) return void tabList.moveTabToWindow(tab, target);
    if (drag) return void (own && own.win && own.win.focus());
    // Lâché hors de toute fenêtre sans avoir été détaché (glissé de côté) : sa propre fenêtre, là.
    const b = state.win.getBounds();
    const w = tabList.detachTab(tab, { x: Math.round(sx - 60), y: Math.round(sy - 18), width: b.width, height: b.height });
    if (w && w.win) w.win.focus();
  });
  // Flèches de la barre d'onglets : page précédente ou suivante de l'onglet de cet écran, comme back / fwd.
  onUi('ui:tab-nav', (e, idx, dir) => {
    if (!state.panes[idx] || (dir !== 1 && dir !== -1)) return;
    state.activePane = idx;
    navigation.navActive(dir);
  });
  onUi('ui:mouse-nav', (e, dir) => {
    if (dir === 1 || dir === -1) navigation.mouseNav(dir);
  });
  onUi('ui:devtools', (e, action) => {
    const tab = tabList.activeTab();
    if (action === 'detach') devtools.detachDevtools(tab);
    else if (action === 'attach') devtools.attachDevtools(tab);
    else devtools.closeDevtools(tab);
  });
  onUi('ui:tab-close', (e, id) => {
    const t = tabList.getTab(id);
    if (t) tabList.closeTab(t);
  });
  onUi('ui:tab-new', (e, idx) => {
    tabList.createTab({ pane: state.panes[idx] ? idx : state.activePane });
    output.focusTerminal();
  });
  onUi('ui:pane', (e, idx) => {
    if (state.panes[idx] && idx !== state.activePane) {
      state.activePane = idx;
      ui.sendState();
    }
  });
  onUi('ui:tab-mute', (e, id) => {
    const tab = tabList.getTab(id);
    if (tab) audio.setMuted(tab, !audio.isMuted(tab));
  });
  onUi('ui:volume', (e, v) => Number.isFinite(v) && audio.setGlobalVolume(v));
  onUi('ui:mode', () => theme.setMode(!theme.isLight()));
  onUi('ui:media-toggle', () => audio.togglePlayAll().catch(() => {}));
  onUi('ui:mute-all', () => audio.setMuteAll(!state.settings.data.muteAll));
  onUi('ui:panel', (e, kind, x) => panelData.PANELS[kind] && panels.togglePanel(kind, Number.isFinite(x) ? x : undefined));
  const fromModal = (e) => !!state.modal && !state.modal.win.isDestroyed() && e.sender === state.modal.win.webContents;
  const fromPanel = (e) => (state.panel && !state.panel.win.isDestroyed() && e.sender === state.panel.win.webContents ? state.panel : null);
  handleUi('ui:suggest', (e, text, rect) => {
    state.suggestList = suggestions.historySuggestions(text);
    suggestions.showSuggest(rect, -1);
    return state.suggestList;
  });
  ipcMain.handle('store:call', (e, name, ...args) => {
    const tab = pageView.tabOfContents(e.sender);
    let origin = '';
    try {
      origin = new URL(e.senderFrame.url).origin;
    } catch {}
    if (!tab || e.senderFrame !== e.sender.mainFrame || origin !== webStore.STORE_ORIGIN) throw new Error('refused');
    return state.inWindow(state.windowOfTab(tab), () => webStore.storeCall(tab, String(name), args));
  });
  onUi('ui:suggest-select', (e, i, rect) => suggestions.showSuggest(rect, i));
  onUi('ui:suggest-hide', () => suggestions.hideSuggest());
  onPopup('panel:act', (e, action, arg) => {
    if (state.findWin && !state.findWin.win.isDestroyed() && e.sender === state.findWin.win.webContents) return findInPage.findAction(action, arg);
    if (state.suggest && !state.suggest.win.isDestroyed() && e.sender === state.suggest.win.webContents) return suggestions.suggestAction(action, arg);
    if (fromModal(e)) return modal.modalAction(action);
    const p = fromPanel(e);
    if (p) panels.panelAction(p.kind, action, arg).catch((err) => output.print([{ t: `  ${err.message}`, c: 'err' }]));
  });
  onPopup('panel:size', (e, height) => {
    if (fromModal(e) && Number.isFinite(height)) return modal.modalSize(height);
    const p = fromPanel(e);
    if (p && Number.isFinite(height)) p.win.setBounds(p.place(Math.min(Math.max(Math.ceil(height), 60), 520)));
  });
  onUi('ui:ext-popup', (e, n, x) => {
    try {
      extPopup.openExtPopup(n, x);
    } catch (err) {
      output.print([{ t: `  ${err.message}`, c: 'err' }]);
    }
  });
}

Object.assign(module.exports, { setupIpc });
