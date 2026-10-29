'use strict';

const { app, shell } = require('electron');
const fav = require('../../shared/favorites');
const C = require('../../shared/commands');
const { t } = require('../../shared/i18n');
const state = require('../state');
const theme = require('../window/theme');
const hist = require('../history/history');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const extPopup = require('../extensions/popup');
const lastSession = require('../tabs/last-session');
const navigation = require('../tabs/navigation');
const split = require('../split/split');
const screens = require('./screens');
const output = require('./output');
const favs = require('../favorites/favorites');
const extCommands = require('../extensions/ext-command');
const dl = require('../downloads/downloads');
const findInPage = require('../search/find-in-page');
const search = require('../search/run-search');
const links = require('../page/links');
const tty = require('../page/tty');
const devtools = require('../devtools/devtools');
const privateBrowsing = require('../private/private');
const questions = require('./questions');
const alias = require('../commands/alias');
const defaultBrowser = require('../commands/default-browser');
const configFile = require('../commands/config');
const lang = require('../commands/lang');
const aiCommands = require('../ai/ai-command');
const nadir = require('../nadir/nadir');
const updates = require('../updates/update-command');
const permissions = require('../security/permissions');
const menu = require('../window/menu');

const tr = t; // là où une variable locale « t » (un onglet) cache t()

async function runCommand(line) {
  const lines = await exec(line);
  output.print([{ t: `❯ ${line}`, c: 'cmd' }, ...lines.lines]);
}

async function exec(raw, depth = 0) {
  const out = [];
  const say = (t, c = '') => out.push({ t, c });
  const result = { lines: out };
  const input = raw.trim();
  const tab = tabList.activeTab();

  if (state.prompts.length) {
    // Une réponse répond à la question ; une autre commande vaut « non » puis s'exécute.
    const isAnswer = state.prompts[0].accept.test(input);
    const p = state.prompts.shift();
    await p.answer(isAnswer ? input : 'non', say);
    if (state.prompts.length) say(`  ? ${state.prompts[0].question}`, 'warn');
    if (isAnswer) return result;
  }
  if (!input) return result;

  const line = C.expandAlias(input, state.settings.data.aliases);
  // La définition d'un alias garde ses « ; » : ils s'exécutent quand on lance l'alias.
  const parts = /^alias\s/i.test(line) ? [line] : C.splitCommands(line);
  if (parts.length > 1) {
    // Un alias peut enchaîner des commandes : « alias work = tab new gmail.com ; tab new github.com ».
    if (depth > 4) {
      say(t('  alias en boucle'), 'err');
      return result;
    }
    for (const part of parts) {
      const r = await exec(part, depth + 1);
      out.push(...r.lines);
      if (r.clear) result.clear = true;
      if (r.hideTerminal) result.hideTerminal = true;
    }
    return result;
  }
  const args = C.tokenize(line);
  const name = args.shift().toLowerCase();
  const rest = line.slice(line.indexOf(' ') + 1 || line.length).trim();

  try {
    // Un numéro ouvre l'élément correspondant de la dernière liste ; « 3t » dans un nouvel onglet.
    const num = name.match(/^(\d+)(t?)$/);
    if (num && !args.length) {
      await select(tab, Number(num[1]), num[2] === 't', say);
      return result;
    }
    // Une commande suivie de mots qu'elle n'attend pas (« home depot », « close friends »)
    // est une recherche, pas une erreur.
    if (args.length && !C.acceptsArgs(name, args)) {
      say(`  → brows ${input}`, 'dim');
      out.push(...(await search.runSearch(tab, input)));
      return result;
    }
    switch (name) {
      case 'help':
      case '?':
        screens.setScreen(tab, { kind: 'help', commands: C.COMMANDS, shortcuts: menu.SHORTCUTS });
        break;
      case 'clear':
        result.clear = true;
        break;
      case 'home':
      case 'accueil':
        screens.showHome(tab);
        break;
      case 'brows':
      case 'search':
      case 's':
        if (!rest) throw new Error(t('que faut-il chercher ? brows <recherche>'));
        out.push(...(await search.runSearch(tab, rest)));
        break;
      case 'n':
      case 'next':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.next) throw new Error(t('pas de page suivante'));
        out.push(...(await search.runSearch(tab, tab.screen.query, tab.screen.next)));
        break;
      case 'p':
      case 'prev':
        if (!tab.screen || tab.screen.kind !== 'results' || !tab.screen.prev) throw new Error(t('pas de page précédente'));
        screens.setScreen(tab, tab.screen.prev, tab.screen.prev.results.map((r) => ({ kind: 'url', url: r.url })));
        break;
      case 'go':
      case 'open':
        if (!rest) throw new Error(t('quelle adresse ? go <url>'));
        navigation.navigate(tab, C.normalizeUrl(rest));
        break;
      case 'tty': {
        const arg = (args[0] || '').toLowerCase();
        const on = arg ? arg === 'on' : !tab.tty;
        tab.tty = on;
        if (on) {
          if (!tab.view || !tab.url) throw new Error(t('aucune page ouverte : « tty » affiche la page en texte'));
          await tty.showTty(tab);
          say(t('  mode tty : la page en texte, liens numérotés (« tty off » pour revenir à la page)'), 'dim');
        } else {
          if (tab.screen && tab.screen.kind === 'tty') tab.screen = null;
          ui.layout();
          ui.sendState();
          say(t('  mode tty désactivé'), 'dim');
        }
        break;
      }
      case 'clicks':
      case 'links':
      case 'l': {
        const count = await links.numberLinks(tab);
        say(t('  {count} éléments numérotés : un numéro clique un lien ou un bouton, ou place le curseur dans un champ (« 3t » : lien dans un nouvel onglet)', { count }), 'dim');
        break;
      }
      case 'back':
      case 'b':
        navigation.goBack(tab);
        break;
      case 'fwd':
      case 'f':
        navigation.goForward(tab);
        break;
      case 'reload':
      case 'r':
        navigation.reloadTab(tab, args[0] === 'hard');
        break;
      case 'tab':
      case 'tabs':
        if (!args.length) tabList.showTabs(tab);
        else if (args[0] === 'new') {
          const urls = args.slice(1);
          // Plusieurs adresses : un onglet pour chacune (groupe d'onglets) ; sinon une adresse ou une recherche.
          if (urls.length > 1 && urls.every((u) => C.looksLikeUrl(u))) for (const u of urls) tabList.createTab({ url: C.normalizeUrl(u) });
          else tabList.createTab({ url: urls.length ? C.normalizeUrl(urls.join(' ')) : undefined });
        } else if (args[0] === 'save') {
          const key = args[1];
          if (!key) throw new Error(t('tab save <nom>'));
          if (C.COMMAND_NAMES.includes(key)) throw new Error(t('« {name} » est déjà une commande', { name: key }));
          const urls = state.tabs.map((t) => t.url).filter((u) => u && /^https?:|^file:/.test(u));
          if (!urls.length) throw new Error(t('aucun onglet avec une page à enregistrer'));
          state.settings.data.aliases[key] = `tab new ${urls.join(' ')}`;
          state.settings.save();
          say(urls.length > 1 ? t('  ✓ alias {name} : rouvre {count} onglets', { name: key, count: urls.length }) : t('  ✓ alias {name} : rouvre 1 onglet', { name: key }), 'ok');
        } else {
          const t = state.tabs[Number(args[0]) - 1];
          if (!t) throw new Error(tr('pas d\'onglet numéro {n}', { n: args[0] }));
          tabList.selectTab(t);
        }
        break;
      case 'close': {
        const t = args.length ? state.tabs[Number(args[0]) - 1] : tab;
        if (!t) throw new Error(tr('pas d\'onglet numéro {n}', { n: args[0] }));
        tabList.closeTab(t);
        break;
      }
      case 'split':
        if (args[0] === 'off' || args[0] === 'close') {
          // Sans numéro, garde l'écran actif ; l'onglet de l'écran fermé reste ouvert.
          const n = args[1] ? Number(args[1]) : 2 - state.activePane;
          if (n !== 1 && n !== 2) throw new Error('split off [1|2]');
          split.closePane(n - 1);
        } else if (state.panes.length > 1) {
          say(t('  déjà en split : « focus » change d\'écran, « split off » ferme l\'autre écran (« split off 1|2 » pour choisir)'), 'dim');
        } else {
          state.panes.push({ tabId: null });
          const t = args.length
            ? tabList.createTab({ url: C.looksLikeUrl(rest) ? C.normalizeUrl(rest) : undefined, background: true, pane: 1 })
            : tabList.createTab({ background: true, pane: 1 });
          split.showInPane(t, 1);
          if (args.length && !C.looksLikeUrl(rest)) out.push(...(await search.runSearch(t, rest)));
        }
        break;
      case 'focus':
        if (state.panes.length === 1) throw new Error(t('pas de split en cours'));
        state.activePane = state.activePane === 0 ? 1 : 0;
        ui.sendState();
        break;
      case 'fav':
        await favs.favCommand(tab, args, say);
        break;
      case 'add': {
        if (!tab.view || !tab.url) throw new Error(t('aucune page ouverte à ajouter'));
        if (!args.length) throw new Error(t('il faut un nom : add [dossier/]nom'));
        const r = fav.addFavorite(state.favorites.data.tree, args.join(' '), tab.url, tab.view.webContents.getTitle());
        favs.saveFavorites();
        if (r.createdFolders.length) say(t('  ✓ dossier {folder}/ créé', { folder: r.createdFolders.join('/') }), 'ok');
        say(r.updated ? t('  ✓ favori mis à jour : {path}', { path: r.path }) : t('  ✓ ajouté aux favoris : {path}', { path: r.path }), 'ok');
        ui.sendState();
        break;
      }
      case 'undo':
        if (!state.lastUndo) throw new Error(t('rien à annuler'));
        fav.restoreFavorite(state.favorites.data.tree, state.lastUndo);
        favs.saveFavorites();
        say(t('  ✓ {name} restauré', { name: state.lastUndo.node.name }), 'ok');
        state.lastUndo = null;
        break;
      case 'hist':
      case 'history':
        hist.showHist(tab, rest);
        break;
      case 'clean':
        if (args[0] === 'all') {
          out.push(...questions.confirm(t('vider historique, cookies et cache ? tu seras déconnecté des sites'), async (s) => {
            state.history.data.entries = [];
            state.history.save();
            await state.ses.clearStorageData({ storages: ['cookies'] });
            await state.ses.clearCache();
            s(t('  ✓ historique, cookies et cache vidés'), 'ok');
          }, false));
        } else {
          state.history.data.entries = [];
          state.history.save();
          say(t('  ✓ historique vidé'), 'ok');
          if (tab.screen && tab.screen.kind === 'hist') hist.showHist(tab, '');
        }
        break;
      case 'find':
        if (!rest || !tab.view || tab.screen) {
          if (rest) tab.findText = rest;
          findInPage.openFind();
        }
        else {
          // Pour Electron, findNext: true ouvre une nouvelle recherche ; false passe au résultat suivant.
          tab.view.webContents.findInPage(rest, { findNext: tab.findText !== rest });
          tab.findText = rest;
        }
        break;
      case 'ext':
        await extCommands.extCommand(tab, args, say);
        break;
      case 'dl':
        if (!args.length) dl.showDl(tab);
        else if (/^(cancel|rm)$/i.test(args[0])) {
          const d = state.downloads[Number(args[1]) - 1];
          if (!d) throw new Error(t('pas de téléchargement numéro {n}', { n: args[1] || '' }));
          if (args[0].toLowerCase() === 'cancel') dl.cancelDownload(d);
          else {
            dl.removeDownload(d);
            say(t('  ✓ {name} retiré de la liste', { name: d.name }), 'ok');
          }
        } else await select(tab, Number(args[0]), false, say, 'dl');
        break;
      case 'alias':
        alias.aliasCommand(tab, line.slice(5).trim(), say);
        break;
      case 'unalias':
        if (!args[0] || !state.settings.data.aliases[args[0]]) throw new Error(t('pas d\'alias « {name} »', { name: args[0] || '' }));
        delete state.settings.data.aliases[args[0]];
        state.settings.save();
        say(t('  ✓ alias {name} supprimé', { name: args[0] }), 'ok');
        break;
      case 'engine':
        if (!args.length) say(t('  moteur : {engine} (ddg | google | bing | qwant)', { engine: C.ENGINES[state.settings.data.engine].label }));
        else {
          if (!C.ENGINES[args[0]]) throw new Error(t('moteurs : ddg, google, bing, qwant'));
          state.settings.data.engine = args[0];
          state.settings.save();
          say(t('  ✓ moteur : {engine}', { engine: C.ENGINES[args[0]].label }) + (args[0] === 'ddg' ? '' : t(' (résultats affichés sur sa page, « clicks » pour numéroter)')), 'ok');
        }
        break;
      case 'theme':
        if (!args.length) say(t('  thèmes : {themes} (actuel : {theme})', { themes: Object.keys(theme.THEMES).join(', '), theme: state.settings.data.theme }));
        else {
          if (!theme.THEMES[args[0]]) throw new Error(t('thèmes : {themes}', { themes: Object.keys(theme.THEMES).join(', ') }));
          state.settings.data.theme = args[0];
          state.settings.save();
          ui.sendState();
        }
        break;
      case 'private':
      case 'prive':
      case 'privé': {
        const arg = (args[0] || '').toLowerCase();
        if (!state.privateMode && (state.panes.length > 1 || tab.private)) await privateBrowsing.setPanePrivate(state.activePane, arg ? arg === 'on' : !tab.private);
        else await privateBrowsing.setPrivate(arg ? arg === 'on' : !state.privateMode);
        const on = tabList.activeTab().private;
        say(on ? t('  navigation privée : rien n\'est retenu, tout est effacé en sortant (Ctrl+Maj+N)') : t('  ✓ fin de la navigation privée, ses données sont effacées'), on ? 'acc' : 'ok');
        break;
      }
      case 'mode': {
        const modes = { nuit: false, night: false, jour: true, day: true };
        if (!args.length) say(t('  mode : {mode} (nuit | jour)', { mode: theme.isLight() ? t('jour') : t('nuit') }));
        else if (!(args[0] in modes)) throw new Error(t('modes : nuit, jour'));
        else theme.setMode(modes[args[0]]);
        break;
      }
      case 'perm':
        permissions.permCommand(args, say);
        break;
      case 'lang':
      case 'langue':
        lang.langCommand(args[0], say);
        break;
      case 'ia':
      case 'ai':
        aiCommands.aiCommand(tab, args, rest, say);
        break;
      case 'nadir':
        nadir.nadirCommand(args, rest, say);
        break;
      case 'update':
        await updates.updateCommand(args, say);
        break;
      case 'devtools':
      case 'dev':
        if (args[0] === 'detach' || args[0] === 'detacher') {
          if (!tab.devOpen) devtools.openDevtools(tab);
          devtools.detachDevtools(tab);
        } else if (args[0] === 'attach' || args[0] === 'rattacher') devtools.attachDevtools(tab);
        else if (args[0] === 'close' || args[0] === 'off') devtools.closeDevtools(tab);
        else devtools.toggleDevtools(tab);
        break;
      case 'term':
        result.hideTerminal = true;
        break;
      case 'fullscreen':
      case 'fs':
        state.win.setFullScreen(args[0] === 'off' ? false : args[0] === 'on' ? true : !state.win.isFullScreen());
        say(state.win.isFullScreen() ? t('  plein écran (F11 ou « fullscreen » pour en sortir)') : t('  plein écran quitté'), 'dim');
        break;
      case 'default':
        await defaultBrowser.defaultCommand(say);
        break;
      case 'config':
        await configFile.configCommand(args[0], args.slice(1).join(' '), say);
        break;
      case 'popback': {
        const n = lastSession.popback(tab);
        say(n > 1 ? t('  ✓ {count} onglets rouverts', { count: n }) : t('  ✓ 1 onglet rouvert'), 'ok');
        break;
      }
      case 'quit':
      case 'exit':
      case 'q':
        setTimeout(() => app.quit(), 50);
        break;
      default:
        if (C.looksLikeUrl(input)) navigation.navigate(tab, C.normalizeUrl(input));
        else {
          say(`  → brows ${input}`, 'dim');
          out.push(...(await search.runSearch(tab, input)));
        }
    }
  } catch (err) {
    say(`  ${err.message}`, 'err');
  }
  return result;
}

async function select(tab, n, newTab, say, onlyKind) {
  const item = tab.numbered[n - 1];
  if (!item || (onlyKind && item.kind !== onlyKind)) {
    if (onlyKind === 'dl' && state.downloads[n - 1]) return select({ numbered: state.downloads.map((d) => ({ kind: 'dl', path: d.path })) }, n, newTab, say);
    throw new Error(tab.numbered.length ? t('pas de numéro {n} ici (1 à {max})', { n, max: tab.numbered.length }) : t('aucune liste numérotée ici (essaie « clicks »)'));
  }
  switch (item.kind) {
    case 'url':
      if (newTab) tabList.createTab({ url: item.url, background: true, opener: tab });
      else navigation.navigate(tab, item.url);
      break;
    case 'search':
      for (const l of await search.runSearch(tab, item.query)) say(l.t, l.c);
      break;
    case 'link':
      if (newTab && item.href) tabList.createTab({ url: item.href, background: true, opener: tab });
      else if (!(await links.clickLink(tab, item.i))) throw new Error(t('ce lien n\'existe plus, relance « clicks »'));
      tab.numbered = [];
      break;
    case 'tab': {
      const t = tabList.getTab(item.id);
      if (!t) throw new Error(tr('onglet fermé'));
      tabList.selectTab(t);
      break;
    }
    case 'aiuse':
      aiCommands.aiUse(tab, item.provider, say);
      break;
    case 'ext':
      extPopup.openExtPopup(item.n);
      break;
    case 'dl':
      if (!item.path) throw new Error(t('fichier pas encore enregistré'));
      if (newTab) dl.showInFolder(item.path);
      else {
        const err = await shell.openPath(item.path);
        if (err) throw new Error(err);
      }
      break;
    default:
  }
  if (newTab) say(t('  ouvert dans un nouvel onglet'), 'dim');
}

Object.assign(module.exports, { runCommand, exec });
