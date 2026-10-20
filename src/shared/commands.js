'use strict';

// Découpe une ligne en mots, en respectant les guillemets.
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Remplace un alias en tête de ligne par sa commande ; les arguments suivent.
function expandAlias(line, aliases) {
  const trimmed = line.trim();
  const first = trimmed.split(/\s+/)[0];
  if (!first || !aliases || !Object.prototype.hasOwnProperty.call(aliases, first)) return trimmed;
  const rest = trimmed.slice(first.length).trim();
  return rest ? `${aliases[first]} ${rest}` : aliases[first];
}

const SCHEMES = /^(https?|file|about|chrome-extension|view-source):/i;

function looksLikeUrl(text) {
  const s = text.trim();
  if (!s || /\s/.test(s)) return false;
  if (SCHEMES.test(s)) return true;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s)) return true;
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s);
}

function normalizeUrl(text) {
  const s = text.trim();
  if (SCHEMES.test(s)) return s;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})/i.test(s)) return `http://${s}`;
  return `https://${s}`;
}

const ENGINES = {
  ddg: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  qwant: { label: 'Qwant', url: (q) => `https://www.qwant.com/?q=${encodeURIComponent(q)}` },
};

// Liste des commandes, utilisée pour l'aide et l'autocomplétion.
const COMMANDS = [
  ['brows', '<recherche>', 'lancer une recherche (résultats numérotés)'],
  ['ia', '[question | use | key | logout | model]', 'réponse courte d\'une IA (Claude, Gemini, ChatGPT, Mistral…) ; « ia » seul pour la choisir'],
  ['go', '<url>', 'ouvrir une adresse'],
  ['<n>', '', 'ouvrir l\'élément numéro n de la liste affichée ; « nt » dans un nouvel onglet'],
  ['links', '', 'numéroter les liens de la page'],
  ['tty', '[on | off]', 'la page en texte simple, liens numérotés en bleu (clic ou numéro)'],
  ['back / fwd / reload', '', 'précédent, suivant, recharger'],
  ['home', '', 'revenir à l\'accueil'],
  ['tab', '[n | new [url…]]', 'lister, changer ou ouvrir un ou plusieurs onglets'],
  ['tab save', '<nom>', 'créer l\'alias <nom> qui rouvre les onglets ouverts'],
  ['close', '[n]', 'fermer l\'onglet courant ou le numéro n'],
  ['split', '[off [1|2]]', 'deux écrans côte à côte ; « focus » change d\'écran, « split off » ferme l\'autre'],
  ['fav', '[dossier]', 'liste des favoris'],
  ['add', '[dossier/]nom', 'ajouter la page aux favoris (crée le dossier si besoin)'],
  ['fav rm', '<chemin | n>', 'supprimer un favori ou un dossier'],
  ['fav mv', '<chemin> <destination>', 'déplacer un favori'],
  ['fav rename', '<chemin> <nom>', 'renommer un favori'],
  ['fav import', '[chrome | edge | brave | firefox | fichier]', 'importer les favoris d\'un autre navigateur (ou d\'un export HTML)'],
  ['undo', '', 'annuler la dernière suppression de favori'],
  ['hist', '[texte]', 'historique, filtré si besoin'],
  ['clean', '[all]', 'vider l\'historique ; « all » vide aussi les cookies et le cache'],
  ['find', '[texte]', 'chercher dans la page (« find » seul efface)'],
  ['ext', '[add | on | off | pin | rm | alias | log | n]', 'gérer les extensions ; « ext pin n » l\'épingle dans la barre du bas, « ext log n » montre ses erreurs'],
  ['dl', '[n]', 'téléchargements ; n ouvre le fichier'],
  ['alias', '[nom = commande]', 'créer un raccourci ; « unalias nom » le supprime'],
  ['adblock', '[on | off]', 'bloqueur de pub de secours, éteint par défaut (uBlock Origin est préinstallé)'],
  ['engine', '[ddg | google | bing | qwant]', 'moteur de recherche'],
  ['theme', '[ambre | vert | cyan | rose | violet]', 'couleur d\'accent'],
  ['private', '[on | off]', 'navigation privée (Ctrl+Maj+N) : onglets à part, rien n\'est retenu'],
  ['mode', '[nuit | jour]', 'mode nuit (par défaut) ou jour ; aussi le bouton lune/soleil en bas'],
  ['lang', '[fr | en]', 'langue de l\'interface (français ou anglais)'],
  ['perm', '[reset [site]]', 'autorisations accordées aux sites (caméra, micro, position…)'],
  ['devtools', '[detach | close]', 'outils de développement : ouvrir, détacher dans une fenêtre, fermer'],
  ['term', '', 'cacher le terminal (Ctrl+J pour le rappeler)'],
  ['fullscreen', '[on | off]', 'plein écran (F11)'],
  ['quit / exit', '', 'quitter le navigateur'],
  ['update', '[install | electron]', 'vérifier ou installer les mises à jour (appli et Electron)'],
  ['update -v', '[version]', 'versions publiées : choisir une version, lire ses notes et l\'installer'],
  ['update auto', '[on | off]', 'vérification automatique au lancement (dev-brows et extensions)'],
  ['help', '', 'cette aide'],
];

const COMMAND_NAMES = [
  'brows', 'ia', 'go', 'links', 'back', 'fwd', 'reload', 'home', 'tab', 'close', 'split', 'focus',
  'fav', 'add', 'undo', 'hist', 'clean', 'find', 'ext', 'dl', 'alias', 'unalias', 'engine',
  'theme', 'mode', 'private', 'prive', 'lang', 'tty', 'adblock', 'perm', 'update', 'devtools', 'term', 'fullscreen', 'quit', 'exit', 'help', 'clear',
];

const SUBCOMMANDS = {
  fav: ['rm', 'mv', 'rename', 'import'],
  ext: ['add', 'on', 'off', 'pin', 'rm', 'alias', 'log'],
  tab: ['new', 'save'],
  split: ['off'],
  clean: ['all'],
  adblock: ['on', 'off'],
  perm: ['reset'],
  ia: ['use', 'connect', 'key', 'logout', 'model'],
  update: ['install', 'electron', 'auto', '-v'],
  engine: Object.keys(ENGINES),
  theme: ['ambre', 'vert', 'cyan', 'rose', 'violet'],
  mode: ['nuit', 'jour'],
  private: ['on', 'off'],
  lang: ['fr', 'en'],
  devtools: ['detach', 'close'],
  tty: ['on', 'off'],
};

// Commandes qui n'acceptent pas de texte libre : ce qu'elles acceptent après leur nom.
const ARG_SHAPES = {
  help: null, '?': null, clear: null, home: null, accueil: null, back: null, b: null, fwd: null, f: null,
  reload: null, r: null, n: null, next: null, p: null, prev: null, links: null, l: null, term: null, quit: null, exit: null, q: null, fullscreen: /^(on|off)$/i, fs: /^(on|off)$/i, tty: /^(on|off)$/i,
  undo: null, focus: null, lang: /^(fr|en)$/i, langue: /^(fr|en)$/i, update: /^(install|electron|auto|-v|versions)$/i,
  tab: /^(\d+|new|save)$/i, tabs: /^(\d+|new|save)$/i, close: /^\d+$/, dl: /^\d+$/, split: /^(off|close)$/i, adblock: /^(on|off)$/i, pub: /^(on|off)$/i,
  devtools: /^(detach|detacher|attach|rattacher|close|off)$/i, dev: /^(detach|detacher|attach|rattacher|close|off)$/i,
};

// Faux si « name args » ne peut pas être cette commande (à chercher plutôt).
function acceptsArgs(name, args) {
  if (!Object.prototype.hasOwnProperty.call(ARG_SHAPES, name)) return true;
  const shape = ARG_SHAPES[name];
  return !!shape && shape.test(args[0]);
}

// « a ; b » : plusieurs commandes à la suite (un « ; » collé dans une adresse n'en sépare pas).
function splitCommands(line) {
  return line.split(/\s+;\s*|\s*;\s+|^;|;$/).map((s) => s.trim()).filter(Boolean);
}

function commonPrefix(words) {
  if (!words.length) return '';
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}

module.exports = {
  tokenize,
  expandAlias,
  looksLikeUrl,
  normalizeUrl,
  acceptsArgs,
  splitCommands,
  ENGINES,
  COMMANDS,
  COMMAND_NAMES,
  SUBCOMMANDS,
  commonPrefix,
};
