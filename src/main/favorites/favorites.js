'use strict';

const fav = require('../../shared/favorites');
const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const panels = require('../panels/panels');
const screens = require('../terminal/screens');
const questions = require('../terminal/questions');
const favImport = require('./import');
const icons = require('./icons');

// Enregistre les favoris et met à jour ce qui les affiche : accueil, liste des favoris, popup.
function saveFavorites() {
  state.favorites.save();
  // Un favori ajouté depuis un onglet ouvert prend tout de suite le logo de cet onglet.
  for (const tab of state.tabs) if (!tab.private && tab.favicon) icons.remember(tab.url, tab.favicon);
  for (const tab of state.tabs) {
    if (!tab.screen) continue;
    try {
      if (tab.screen.kind === 'home') screens.showHome(tab);
      else if (tab.screen.kind === 'fav') showFav(tab, tab.screen.folder);
    } catch {
      showFav(tab, ''); // le dossier affiché n'existe plus
    }
  }
  panels.sendPanel('fav');
  ui.sendState();
}

// Un logo de favori vient d'arriver : la liste « fav » affichée se redessine.
function refreshFavScreens() {
  for (const tab of state.tabs) {
    if (tab.screen && tab.screen.kind === 'fav') {
      try {
        showFav(tab, tab.screen.folder);
      } catch {
        // dossier disparu : saveFavorites s'en occupe
      }
    }
  }
}

function showFav(tab, folder) {
  const tree = state.favorites.data.tree;
  const node = folder ? fav.getNode(tree, folder) : tree;
  if (!node || node.type !== 'folder') throw new Error(t('dossier introuvable : {folder}', { folder }));
  const prefix = folder ? fav.splitPath(folder).join('/') : '';
  const rows = fav.flatten(node, prefix);
  const numbered = [];
  rows.forEach((r) => {
    if (r.type === 'link') {
      numbered.push({ kind: 'url', url: r.url, path: r.path });
      r.n = numbered.length;
      r.icon = icons.iconFor(r.url);
    }
  });
  screens.setScreen(tab, { kind: 'fav', folder: prefix, rows, counts: fav.countAll(node) }, numbered);
}

function favPathArg(tab, arg) {
  // Accepte un chemin ou le numéro affiché dans « fav ».
  if (/^\d+$/.test(arg) && tab.numberedKind === 'fav') {
    const item = tab.numbered[Number(arg) - 1];
    if (item) return item.path;
  }
  return arg;
}

async function favCommand(tab, args, say) {
  const tree = state.favorites.data.tree;
  const sub = args[0];
  if (sub === 'rm' || sub === 'del') {
    if (!args[1]) throw new Error(t('fav rm <chemin | n>'));
    const target = favPathArg(tab, args.slice(1).join(' '));
    const node = fav.getNode(tree, target);
    if (!node) throw new Error(t('favori introuvable : {path}', { path: target }));
    const question = node.type === 'folder' ? t('supprimer le dossier {path}/ et son contenu ?', { path: target }) : t('supprimer {path} ?', { path: target });
    questions.ask(say, question, async (s) => {
      state.lastUndo = fav.removeFavorite(tree, target);
      saveFavorites();
      s(t('  ✓ supprimé (undo pour annuler)'), 'ok');
      ui.sendState();
    });
    return;
  }
  if (sub === 'import') return favImport.importCommand(tab, args.slice(1).join(' '), say);
  if (sub === 'mv') {
    if (args.length < 3) throw new Error(t('fav mv <chemin> <destination>'));
    const node = fav.moveFavorite(tree, favPathArg(tab, args[1]), args[2]);
    saveFavorites();
    say(t('  ✓ {name} déplacé vers {dest}', { name: node.name, dest: args[2] }), 'ok');
  } else if (sub === 'rename') {
    if (args.length < 3) throw new Error(t('fav rename <chemin> <nouveau nom>'));
    fav.renameFavorite(tree, favPathArg(tab, args[1]), args[2]);
    saveFavorites();
    say(t('  ✓ renommé en {name}', { name: args[2] }), 'ok');
  }
  const folder = !sub || ['mv', 'rename'].includes(sub) ? (tab.screen && tab.screen.kind === 'fav' ? tab.screen.folder : '') : args.join(' ');
  showFav(tab, folder);
}

Object.assign(module.exports, { saveFavorites, showFav, favCommand, refreshFavScreens });
