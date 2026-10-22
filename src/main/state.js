'use strict';

// État partagé du processus principal. Les modules se requièrent les uns les autres en boucle :
// chacun lit ses voisins au moment de l'appel (state.win, tabList.createTab()…), jamais au chargement,
// et publie ses fonctions avec Object.assign(module.exports, …) pour garder le même objet exporté.
module.exports = {
  win: null,
  ses: null,
  chromeApi: null, // API d'extensions Chrome (onglets, fenêtres…) qu'Electron ne fournit pas
  favorites: null, // JsonStore { tree }
  history: null, // JsonStore { entries }
  sessionStore: null, // JsonStore { tabs } : adresses des onglets ouverts, pour « popback »
  previousSession: [], // celles de la dernière fois, lues au lancement
  lastCommandAt: 0, // heure de la dernière commande tapée (0 : la page a repris le focus), pour garder le focus dans le terminal
  settings: null, // JsonStore { engine, theme, aliases, extensions }
  exts: null,

  tabs: [],
  panes: [{ tabId: null }],
  activePane: 0,
  rects: [],
  dragging: false,
  addingTab: false, // ensureView déclare l'onglet aux extensions, qui croient devoir l'afficher
  prompts: [], // questions oui/non en attente, la première est affichée
  lastUndo: null,
  downloads: [],
  popupWin: null,
  panel: null, // popup de la barre du bas : { kind: 'dl' | 'fav', win, place }
  privSes: null, // session de la navigation privée (créée au premier Ctrl+Maj+N)
  privApi: null, // ses API d'extensions
  privateMode: null, // en navigation privée : { tabs, panes, activePane } normaux, mis de côté
  fullTab: null, // onglet dont une vidéo est en plein écran
  fullSetWin: false, // la fenêtre est passée en plein écran pour la vidéo
  suggest: null, // fenêtre des suggestions de l'adresse : { win, key, ready, data }
  suggestList: [],
  findWin: null, // Ctrl+F : { win, tabId, screen }
  modal: null, // question au milieu de la fenêtre : { win, place, answer }
};
