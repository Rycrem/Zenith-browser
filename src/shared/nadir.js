'use strict';

// Nadir, l'assistant de Zenith : un modèle qui tourne sur l'ordinateur (node-llama-cpp).
// Trois niveaux, du plus léger au plus juste ; chaque modèle est téléchargé à son premier usage.
// thoughts : les modèles Qwen3 « hybrides » réfléchissent longuement avant de répondre, ce qu'on évite.
const LEVELS = {
  leger: {
    name: 'léger',
    uri: 'hf:unsloth/Qwen3-1.7B-GGUF:Q4_K_M',
    file: 'Qwen3-1.7B-Q4_K_M.gguf',
    size: 1.11e9,
    thoughts: 'discourage',
    about: 'rapide même sans carte graphique, moins sûr pour enchaîner des actions',
  },
  normal: {
    name: 'normal',
    uri: 'hf:unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    size: 2.5e9,
    thoughts: 'auto',
    about: 'le bon compromis pour la plupart des ordinateurs',
  },
  fort: {
    name: 'fort',
    uri: 'hf:unsloth/Qwen3-8B-GGUF:Q4_K_M',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    size: 5.03e9,
    thoughts: 'discourage',
    about: 'plus juste, demande une bonne carte graphique ou 16 Go de mémoire',
  },
};

const LEVEL_ALIASES = { léger: 'leger', light: 'leger', medium: 'normal', strong: 'fort' };

function resolveLevel(name) {
  const id = String(name || '').toLowerCase();
  const key = LEVEL_ALIASES[id] || id;
  return LEVELS[key] ? key : null;
}

// Niveau par défaut d'après la mémoire de l'ordinateur ; « fort » ne se choisit qu'à la main.
function defaultLevel(totalMem) {
  return totalMem < 7.5 * 1024 ** 3 ? 'leger' : 'normal';
}

// Commandes que Nadir ne lance qu'après un oui dans la discussion : elles effacent, désinstallent ou quittent.
const SENSITIVE = [
  /^(quit|exit|q)$/,
  /^clean\b/,
  /^(fav|ext|dl)\s+rm\b/,
  /^unalias\b/,
  /^perm\s+reset\b/,
  /^config\s+import\b/,
  /^(ia|ai)\s+(key|logout|connect)\b/,
  /^update\s+(install|electron)\b/,
  /^default$/,
];

function needsConfirm(line) {
  const s = String(line).trim().toLowerCase();
  return SENSITIVE.some((re) => re.test(s));
}

// Un clic qui peut payer, envoyer ou supprimer quelque chose demande aussi un oui.
const RISKY_CLICK = /\b(achet|pay|commande[rz]?\b|valider (la|ma) commande|buy|order|checkout|supprim|delete|remove|effacer|envoy|send|publi|post|submit|souscri|subscribe|s'abonner|confirmer le paiement)/i;

function riskyClick(label) {
  return RISKY_CLICK.test(String(label || ''));
}

// Consignes de Nadir : ce qu'est Zenith, ses commandes et raccourcis (ceux de l'aide « help »,
// déjà traduits), et comment agir. La consigne reste en français ; la réponse suit la langue choisie.
function systemPrompt({ lang, commands, shortcuts }) {
  return [
    'Tu es Nadir, l\'assistant intégré au navigateur Zenith. Tu tournes entièrement sur l\'ordinateur de la personne : rien de ce qu\'elle te dit ne part sur internet.',
    `Réponds en ${lang === 'en' ? 'anglais' : 'français'}, en phrases courtes et simples, sans Markdown ni titre. Tutoie la personne.`,
    '',
    'Zenith est un navigateur basé sur Chromium qui se pilote comme un terminal : les pages s\'affichent en haut, un terminal en bas reçoit des commandes tapées au clavier.',
    'Barre d\'onglets en haut avec la barre d\'adresse (☆ ajoute la page aux favoris). Barre du bas : ★ favoris à gauche ; à droite les extensions épinglées, le bouton des extensions, les téléchargements (↓), le mode jour/nuit et toi, Nadir, tout à droite.',
    'Une ligne qui n\'est pas une commande est une recherche ; une adresse ouvre le site.',
    '',
    'Commandes de Zenith :',
    ...commands.map(([name, args, desc]) => `- ${name}${args ? ` ${args}` : ''} : ${desc}`),
    '',
    'Raccourcis :',
    ...shortcuts.map(([keys, desc]) => `- ${keys} : ${desc}`),
    '',
    'Tes outils :',
    '- commande : lance une commande de Zenith comme si la personne la tapait (ex. « go youtube.com », « tab new », « split », « mode jour »).',
    '- onglets : liste les onglets ouverts.',
    '- lire_page : lit le texte de la page ouverte.',
    '- elements_page : liste les liens, boutons et champs de la page, numérotés ; cliquer et ecrire agissent sur ces numéros.',
    'Règles :',
    '- Une question sur Zenith : réponds avec la liste ci-dessus, sans outil. N\'invente jamais de commande ni de raccourci.',
    '- Une question sur la page : appelle lire_page avant de répondre.',
    '- Une action dans le navigateur : fais-la toi-même avec tes outils, étape par étape, puis dis en une phrase ce que tu as fait.',
    '- Après un changement de page, rappelle elements_page avant de cliquer : les numéros changent.',
    '- Ne saisis jamais de mot de passe ni de numéro de carte. Si une action échoue deux fois, explique ce qui bloque.',
  ].join('\n');
}

module.exports = { LEVELS, resolveLevel, defaultLevel, needsConfirm, riskyClick, systemPrompt };
