'use strict';

const { app, session, WebContentsView, Menu } = require('electron');
const M = require('../../shared/messengers');
const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const output = require('../terminal/output');
const dl = require('../downloads/downloads');
const { popupWindow } = require('../panels/popup-window');

// Ce que les applis obtiennent sans question : les notifications, le micro et la caméra
// (messages vocaux, appels), seulement pour leurs propres adresses.
const ALLOWED = new Set(['notifications', 'media', 'clipboard-sanitized-write', 'fullscreen']);
const HEADER_H = 30; // barre du tiroir : nom de l'appli, recharger, fermer
const WIDTH = 420;

// Une vue par appli, commune à toutes les fenêtres (deux WhatsApp Web ouverts se gêneraient) :
// { view, unread, w : la fenêtre Zenith où elle est affichée }.
const apps = {};
const sessions = {};

const used = () => (state.settings.data.messengers = state.settings.data.messengers || []);
const pinned = () => (state.settings.data.pinnedApps = state.settings.data.pinnedApps || []).filter(M.isMessenger);

function setupSession(id) {
  if (sessions[id]) return sessions[id];
  const ses = session.fromPartition(M.MESSENGERS[id].partition);
  // WhatsApp Web refuse les navigateurs qu'il ne reconnaît pas : celui d'un Chrome ordinaire.
  ses.setUserAgent(app.userAgentFallback);
  const ok = (perm, url) => ALLOWED.has(perm) && M.isOwnUrl(id, url);
  ses.setPermissionRequestHandler((wc, perm, cb, d) => cb(ok(perm, d.requestingUrl || wc.getURL())));
  ses.setPermissionCheckHandler((wc, perm, origin) => ok(perm, origin));
  dl.setupDownloads(ses);
  sessions[id] = ses;
  return ses;
}

// Un lien vers un autre site s'ouvre dans un onglet de la fenêtre de l'appli.
function openInTab(entry, url) {
  if (!/^https?:/i.test(url)) return;
  state.inWindow(entry.w || state.current(), () => {
    tabList.createTab({ url });
    ui.sendState();
  });
}

function ensure(id) {
  if (apps[id]) return apps[id];
  const view = new WebContentsView({ webPreferences: { session: setupSession(id), sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  view.setBackgroundColor('#ffffff');
  const entry = { view, unread: 0, w: null };
  apps[id] = entry;
  const wc = view.webContents;
  wc.on('page-title-updated', (e, title) => {
    const n = M.unreadFromTitle(title);
    if (n === entry.unread) return;
    entry.unread = n;
    changed();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (M.isOwnUrl(id, url)) return { action: 'allow' };
    openInTab(entry, url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e) => {
    if (M.isOwnUrl(id, e.url)) return;
    e.preventDefault();
    openInTab(entry, e.url);
  });
  // Page arrêtée (plantage, mémoire) : rechargée plutôt que laissée blanche.
  wc.on('render-process-gone', (e, d) => {
    if (d.reason !== 'clean-exit') setTimeout(() => !wc.isDestroyed() && wc.reload(), 1000);
  });
  wc.loadURL(M.MESSENGERS[id].url);
  return entry;
}

// Pastilles de la barre et tiroir des applis à jour dans toutes les fenêtres.
function changed() {
  ui.sendStateAll();
  for (const w of state.allWindows()) state.inWindow(w, () => require('../panels/panels').sendPanel('apps'));
}

// ------------------------------------------------ le tiroir de discussion

// Au-dessus de son icône, de sous les onglets jusqu'à la barre du bas.
function drawerBounds(x) {
  const b = state.win.getContentBounds();
  const width = Math.min(WIDTH, b.width - 16);
  const right = Number.isFinite(x) ? b.x + Math.round(x) : b.x + b.width - 16;
  const left = Math.max(b.x + 8, Math.min(right - width, b.x + b.width - width - 8));
  const top = b.y + 48;
  return { x: left, y: top, width, height: Math.max(200, b.y + b.height - 32 - top) };
}

function fitView(d) {
  const entry = apps[d.id];
  if (!entry || entry.w !== state.current() || d.win.isDestroyed()) return;
  const [width, height] = d.win.getContentSize();
  entry.view.setBounds({ x: 0, y: HEADER_H, width, height: Math.max(0, height - HEADER_H) });
}

function sendHeader(d) {
  if (d.win.isDestroyed()) return;
  d.win.webContents.send('panel:data', { id: d.id, name: M.MESSENGERS[d.id].name, reload: t('Recharger'), close: t('Fermer (même icône ou « {cmd} »)', { cmd: d.id }) });
}

// Retire la vue de la fenêtre où elle est affichée, sans la détruire : l'appli reste connectée.
function detach(entry) {
  const w = entry.w;
  if (!w) return;
  entry.w = null;
  const d = w.drawer;
  if (d && apps[d.id] === entry && !d.win.isDestroyed()) d.win.contentView.removeChildView(entry.view);
}

function open(id, x) {
  const entry = ensure(id);
  // Déjà affichée dans une autre fenêtre : elle la quitte.
  if (entry.w && entry.w !== state.current()) {
    const other = entry.w;
    state.inWindow(other, close);
  }
  let d = state.drawer;
  if (d && d.id !== id) {
    detach(apps[d.id]);
    d.id = id;
  }
  if (Number.isFinite(x)) state.drawerX = x;
  if (!d) {
    const win = popupWindow('drawer.html', { ...drawerBounds(state.drawerX), minWidth: 300 });
    d = { id, win };
    state.drawer = d;
    const own = state.current();
    win.webContents.on('did-finish-load', () => sendHeader(d));
    win.once('ready-to-show', () => win.show());
    // Fenêtre fermée (Zenith qui se ferme) : l'appli la quitte avant, pour ne pas être détruite.
    win.on('close', () => {
      const e = apps[d.id];
      if (e && e.w === own) detach(e);
      if (own.drawer === d) own.drawer = null;
      state.inWindow(own, ui.sendState);
    });
    win.on('resize', () => fitView(d));
  } else {
    d.win.setBounds(drawerBounds(state.drawerX));
    sendHeader(d);
  }
  entry.w = state.current();
  d.win.contentView.addChildView(entry.view);
  fitView(d);
  if (d.win.isVisible()) entry.view.webContents.focus();
  else d.win.once('show', () => !entry.view.webContents.isDestroyed() && entry.view.webContents.focus());
  // Ouverte une fois, l'appli se charge aux lancements suivants pour les notifications et les pastilles.
  if (!used().includes(id)) {
    used().push(id);
    state.settings.save();
  }
  ui.sendState();
}

function close() {
  const d = state.drawer;
  if (!d) return;
  if (apps[d.id]) detach(apps[d.id]);
  state.drawer = null;
  if (!d.win.isDestroyed()) d.win.close();
  const tab = tabList.activeTab();
  if (tab && tab.view && !tab.screen) tab.view.webContents.focus();
  else output.focusTerminal();
  ui.sendState();
}

function toggle(id, x) {
  if (!M.isMessenger(id)) return;
  if (state.drawer && state.drawer.id === id) close();
  else open(id, x);
}

// Appelé par ui.layout (fenêtre déplacée, redimensionnée, vidéo en plein écran).
function layoutDrawer() {
  const d = state.drawer;
  if (!d || d.win.isDestroyed()) return;
  if (state.fullTab) {
    if (d.win.isVisible()) d.win.hide();
    return;
  }
  d.win.setBounds(drawerBounds(state.drawerX));
  if (!d.win.isVisible()) d.win.showInactive();
  fitView(d);
}

const isDrawer = (wc) => !!state.drawer && !state.drawer.win.isDestroyed() && state.drawer.win.webContents === wc;

function drawerAction(action) {
  const d = state.drawer;
  if (!d) return;
  if (action === 'close') close();
  else if (action === 'reload' && apps[d.id]) apps[d.id].view.webContents.reload();
}

// ------------------------------------------------ épingler, recharger, fermer

function pin(id, index) {
  if (!M.isMessenger(id)) return;
  state.settings.data.pinnedApps = M.pinAt(pinned(), id, index);
  state.settings.save();
  changed();
}

function unpin(id) {
  state.settings.data.pinnedApps = pinned().filter((x) => x !== id);
  state.settings.save();
  changed();
}

// « Fermer l'appli » : la vue est détruite (mémoire libérée) et l'appli ne se charge plus au lancement.
// La session reste : on la retrouve connectée en la rouvrant.
function quit(id) {
  const entry = apps[id];
  if (entry) {
    if (entry.w) state.inWindow(entry.w, close);
    delete apps[id];
    entry.view.webContents.close();
  }
  state.settings.data.messengers = used().filter((x) => x !== id);
  state.settings.save();
  changed();
}

function reload(id) {
  if (apps[id]) apps[id].view.webContents.reload();
  else ensure(id);
}

// Clic droit sur une appli (barre du bas ou tiroir des applis).
function appMenu(id, popupWin) {
  if (!M.isMessenger(id)) return;
  const isPinned = pinned().includes(id);
  const w = state.current();
  const inW = (fn) => () => state.inWindow(w, fn);
  Menu.buildFromTemplate([
    { label: t('Ouvrir'), click: inW(() => {
      if (state.panel && state.panel.kind === 'apps' && !state.panel.win.isDestroyed()) state.panel.win.close();
      if (!state.drawer || state.drawer.id !== id) state.win.webContents.send('ui:messenger', id);
    }) },
    isPinned ? { label: t('Désépingler'), click: inW(() => unpin(id)) } : { label: t('Épingler à la barre'), click: inW(() => pin(id)) },
    { type: 'separator' },
    { label: t('Recharger'), click: inW(() => reload(id)) },
    { label: t('Fermer l\'appli (libère la mémoire)'), enabled: !!apps[id], click: inW(() => quit(id)) },
  ]).popup({ window: popupWin || state.win });
}

// ------------------------------------------------ le tiroir des applis (flèche de la barre du bas)

function trayData() {
  const list = Object.keys(M.MESSENGERS).map((id) => ({ id, name: M.MESSENGERS[id].name, unread: apps[id] ? apps[id].unread : 0, pinned: pinned().includes(id), open: !!(state.drawer && state.drawer.id === id) }));
  const total = list.reduce((n, a) => n + Math.max(0, a.unread), 0);
  return {
    title: t('applis'),
    total: total ? t('{n} non lus', { n: total }) : '',
    hint: t('Clic droit ou glisser vers la barre pour épingler.'),
    pinnedLabel: t('épinglée'),
    list,
  };
}

// Glisser une appli du tiroir vers la barre du bas : l'interface montre la place, puis l'épingle.
function overBar(sx, sy) {
  const b = state.win.getContentBounds();
  const x = sx - b.x;
  const y = sy - b.y;
  return x >= 0 && x <= b.width && y >= b.height - 40 && y <= b.height + 8 ? x : null;
}

async function trayAction(action, arg) {
  const id = arg && arg.id;
  if (!M.isMessenger(id)) return;
  if (action === 'open') {
    if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
    return toggle(id, state.drawerX);
  }
  if (action === 'menu') return appMenu(id, state.panel && state.panel.win);
  if (action === 'drag' || action === 'drop') {
    const x = Number.isFinite(arg.sx) && Number.isFinite(arg.sy) ? overBar(arg.sx, arg.sy) : null;
    const wc = state.win.webContents;
    if (action === 'drag') return wc.send('ui:apps-hover', x === null ? null : { id, x });
    wc.send('ui:apps-hover', null);
    if (x !== null) wc.send('ui:apps-drop', { id, x });
  }
}

// ------------------------------------------------ fenêtres, lancement, état

// Fenêtre Zenith qui se ferme : l'appli quitte son tiroir sans être détruite.
function windowClosing(w) {
  state.inWindow(w, () => {
    if (state.drawer) close();
  });
}

// Au lancement : les applis déjà ouvertes une fois tournent en fond (notifications, pastilles).
function preload() {
  for (const id of used()) if (M.isMessenger(id)) ensure(id);
}

function messengerState() {
  return {
    open: state.drawer ? state.drawer.id : null,
    trayOpen: !!(state.panel && state.panel.kind === 'apps'),
    pinned: pinned(),
    apps: Object.keys(M.MESSENGERS).map((id) => ({ id, name: M.MESSENGERS[id].name, unread: apps[id] ? apps[id].unread : 0 })),
  };
}

// whatsapp | messages | discord [pin | unpin | reload | close]
function messengerCommand(id, args, say) {
  const name = M.MESSENGERS[id].name;
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'pin') {
    pin(id);
    say(t('  ✓ {name} épinglé dans la barre du bas', { name }), 'ok');
  } else if (sub === 'unpin') {
    unpin(id);
    say(t('  ✓ {name} retiré de la barre du bas (toujours dans le tiroir des applis, flèche ⌃)', { name }), 'ok');
  } else if (sub === 'reload') {
    reload(id);
    say(t('  {name} rechargé', { name }), 'dim');
  } else if (sub === 'close') {
    quit(id);
    say(t('  {name} fermé : il ne se charge plus au lancement, « {cmd} » le rouvre', { name, cmd: id }), 'dim');
  } else {
    // L'interface sait où est son icône (ou la flèche) : elle ouvre le tiroir au-dessus.
    if (state.drawer && state.drawer.id === id) close();
    else {
      state.win.webContents.send('ui:messenger', id);
      say(t('  {name} ouvert ; « {cmd} » ou son icône le referme', { name, cmd: id }), 'dim');
    }
  }
}

Object.assign(module.exports, { toggle, open, close, pin, unpin, appMenu, layoutDrawer, isDrawer, drawerAction, trayData, trayAction, windowClosing, preload, messengerState, messengerCommand });
