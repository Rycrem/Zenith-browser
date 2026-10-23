'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// État partagé du processus principal. Les modules se requièrent les uns les autres en boucle :
// chacun lit ses voisins au moment de l'appel (state.win, tabList.createTab()…), jamais au chargement,
// et publie ses fonctions avec Object.assign(module.exports, …) pour garder le même objet exporté.
const shared = {
  ses: null,
  chromeApi: null, // API d'extensions Chrome (onglets, fenêtres…) qu'Electron ne fournit pas
  favorites: null, // JsonStore { tree }
  history: null, // JsonStore { entries }
  sessionStore: null, // JsonStore { tabs } : adresses des onglets ouverts, pour « popback »
  previousSession: [], // celles de la dernière fois, lues au lancement
  settings: null, // JsonStore { engine, theme, aliases, extensions }
  exts: null,
  downloads: [],
  privSes: null, // session de la navigation privée (créée au premier Ctrl+Maj+N)
  privApi: null, // ses API d'extensions
  mobile: null, // mode mobile : l'appareil imité (page/mobile.js)
};

// Ce qui appartient à chaque fenêtre Zenith (ses onglets, son split, ses popups…).
function newWindowState() {
  return {
    win: null,
    tabs: [],
    panes: [{ tabId: null }],
    activePane: 0,
    rects: [],
    dragging: false,
    addingTab: false, // ensureView déclare l'onglet aux extensions, qui croient devoir l'afficher
    prompts: [], // questions oui/non en attente, la première est affichée
    lastUndo: null,
    lastCommandAt: 0, // heure de la dernière commande tapée (0 : la page a repris le focus), pour garder le focus dans le terminal
    popupWin: null,
    panel: null, // popup de la barre du bas : { kind: 'dl' | 'fav', win, place }
    privateMode: null, // en navigation privée : { tabs, panes, activePane } normaux, mis de côté
    fullTab: null, // onglet dont une vidéo est en plein écran
    fullSetWin: false, // la fenêtre est passée en plein écran pour la vidéo
    suggest: null, // fenêtre des suggestions de l'adresse : { win, key, ready, data }
    suggestList: [],
    findWin: null, // Ctrl+F : { win, tabId, screen }
    modal: null, // question au milieu de la fenêtre : { win, place, answer }
    stateQueued: false, // un envoi de l'état à l'interface est prévu
  };
}
const OWN = new Set(Object.keys(newWindowState()));

// Plusieurs fenêtres : state.win, state.tabs… sont ceux de la fenêtre « en cours », celle d'où
// vient l'événement traité (et ce qu'il attend ensuite, grâce à AsyncLocalStorage). Sans
// fenêtre connue (menu, extension…), c'est la dernière fenêtre à avoir eu le focus.
const windows = [newWindowState()];
let focused = windows[0];
const als = new AsyncLocalStorage();
const current = () => als.getStore() || focused;

const inWindow = (w, fn) => als.run(w || current(), fn);
const allWindows = () => windows.slice();
// Les onglets d'une fenêtre, y compris ceux mis de côté par la navigation privée.
const tabsOf = (w) => [...w.tabs, ...(w.privateMode ? w.privateMode.tabs : [])];
const allTabs = () => windows.flatMap(tabsOf);
const windowOfTab = (tab) => windows.find((w) => tabsOf(w).includes(tab)) || null;

function addWindow() {
  const w = newWindowState();
  windows.push(w);
  return w;
}

function removeWindow(w) {
  const i = windows.indexOf(w);
  if (i >= 0) windows.splice(i, 1);
  if (focused === w) focused = windows[0] || w;
}

function setFocused(w) {
  if (windows.includes(w)) focused = w;
}

// La fenêtre Zenith d'un expéditeur : son interface, une de ses pages ou une de ses popups.
function windowOf(wc) {
  if (!wc) return null;
  for (const w of windows) {
    if (w.win && !w.win.isDestroyed() && w.win.webContents === wc) return w;
    if (tabsOf(w).some((tb) => (tb.view && tb.view.webContents === wc) || (tb.dev && tb.dev.webContents === wc))) return w;
    for (const p of [w.panel, w.suggest, w.findWin, w.modal]) if (p && p.win && !p.win.isDestroyed() && p.win.webContents === wc) return w;
    if (w.popupWin && !w.popupWin.isDestroyed() && w.popupWin.webContents === wc) return w;
  }
  return null;
}

// Les écouteurs de cet émetteur (fenêtre, webContents) s'exécutent dans la fenêtre que donne
// which() au moment de l'événement : fixe pour une fenêtre, celle de l'onglet pour une page
// (qui peut passer d'une fenêtre à l'autre).
function bindEmitter(em, which) {
  const wrapped = new WeakMap();
  const wrap = (fn) => {
    if (typeof fn !== 'function') return fn;
    if (!wrapped.has(fn)) {
      const w = function (...a) { return als.run(which() || current(), () => fn.apply(this, a)); };
      if (fn.listener) w.listener = fn.listener; // once() : retirable par la fonction d'origine
      wrapped.set(fn, w);
    }
    return wrapped.get(fn);
  };
  // once() passe par on().
  for (const m of ['on', 'addListener', 'prependListener']) {
    const orig = em[m];
    em[m] = function (ev, fn) { return orig.call(this, ev, wrap(fn)); };
  }
  for (const m of ['off', 'removeListener']) {
    const orig = em[m];
    em[m] = function (ev, fn) { return orig.call(this, ev, wrapped.get(fn) || fn); };
  }
}

// Une popup (panneau, recherche…) reste à la fenêtre qui l'a ouverte.
function bindToCurrent(bw) {
  const w = current();
  bindEmitter(bw, () => w);
  bindEmitter(bw.webContents, () => w);
  return bw;
}

const helpers = { bindToCurrent, inWindow, allWindows, allTabs, tabsOf, windowOfTab, windowOf, addWindow, removeWindow, setFocused, bindEmitter, current, newWindowState };

module.exports = new Proxy(shared, {
  get(target, k) {
    if (k in helpers) return helpers[k];
    if (OWN.has(k)) return current()[k];
    return target[k];
  },
  set(target, k, v) {
    if (OWN.has(k)) current()[k] = v;
    else target[k] = v;
    return true;
  },
});
