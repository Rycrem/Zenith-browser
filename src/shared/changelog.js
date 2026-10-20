'use strict';

// Notes de mise à jour affichées en bas de l'écran d'accueil (la version installée).
// Ajouter une entrée en tête à chaque nouvelle version : notes en français, en anglais dans `en`.
const CHANGELOG = [
  {
    version: '0.1.16',
    notes: [
      '« update -v » liste les versions publiées : choisis-en une pour lire ses notes et l\'installer (même une plus ancienne).',
      'Mode « tty » : la page en texte simple, comme dans un terminal, avec les liens en bleu soulignés et numérotés (tape le numéro ou clique).',
    ],
    en: [
      '“update -v” lists published versions: pick one to read its notes and install it (even an older one).',
      '“tty” mode: the page as plain text, like in a terminal, with links underlined in blue and numbered (type the number or click).',
    ],
  },
  {
    version: '0.1.15',
    notes: ['Rien de nouveau dans l\'appli : le README retrouve sa partie installation et ne décrit plus la publication des versions.'],
    en: ['Nothing new in the app: the README has its install section back and no longer describes publishing versions.'],
  },
  {
    version: '0.1.14',
    notes: ['Rien de nouveau dans l\'appli : le dépôt ne parle plus d\'installation ni de signature SignPath.'],
    en: ['Nothing new in the app: the repository no longer covers installing or SignPath signing.'],
  },
  {
    version: '0.1.13',
    notes: [
      'Option anglais : commande « lang en », et choix de la langue dans l\'installateur Windows.',
      'L\'installateur Windows peut être signé (SignPath), pour que le Contrôle intelligent des applications de Windows 11 ne le bloque plus.',
      '« update auto off » coupe la vérification automatique des mises à jour au lancement (aussi proposé dans l\'installateur Windows).',
    ],
    en: [
      'English option: “lang en” command, and language choice in the Windows installer.',
      'The Windows installer can be signed (SignPath), so that Windows 11 Smart App Control no longer blocks it.',
      '“update auto off” turns off the automatic update check at launch (also offered in the Windows installer).',
    ],
  },
  {
    version: '0.1.12',
    notes: [
      'Les mises à jour sont vérifiées à chaque lancement (et plus une fois par jour).',
      'Les extensions du Chrome Web Store et uBlock Origin se mettent à jour toutes seules au lancement.',
      'Clés de sécurité (YubiKey) : quand la clé garde plusieurs comptes pour un site, le terminal demande lequel utiliser (avant, la connexion était annulée).',
    ],
    en: [
      'Updates are checked at every launch (no longer once a day).',
      'Chrome Web Store extensions and uBlock Origin update themselves at launch.',
      'Security keys (YubiKey): when the key holds several accounts for a site, the terminal asks which one to use (sign-in used to be cancelled).',
    ],
  },
  {
    version: '0.1.11',
    notes: [
      'uBlock Origin est préinstallé et fonctionne : il bloque les pubs et sa popup s\'ouvre (Alt+1 ou clic sur sa pastille).',
      'Le bloqueur intégré devient un secours, éteint par défaut (« adblock on »).',
      'Clic droit sur une image : « Enregistrer l\'image » ; aussi pour les liens, vidéos et sons.',
      'Ces notes de mise à jour en bas de l\'écran d\'accueil.',
    ],
    en: [
      'uBlock Origin comes preinstalled and works: it blocks ads and its popup opens (Alt+1 or click its badge).',
      'The built-in blocker becomes a fallback, off by default (“adblock on”).',
      'Right-click on an image: “Save image”; also for links, videos and sounds.',
      'These release notes at the bottom of the home screen.',
    ],
  },
  {
    version: '0.1.10',
    notes: ['« fullscreen » ou F11 : plein écran.'],
    en: ['“fullscreen” or F11: full screen.'],
  },
  {
    version: '0.1.9',
    notes: ['« find » trouve les résultats dès la première recherche.'],
    en: ['“find” finds results on the first search.'],
  },
  {
    version: '0.1.8',
    notes: [
      'Le clavier reste dans le terminal après une commande.',
      'Le bouton + ouvre un onglet ; un clic sur l\'adresse la copie.',
      'Le zoom s\'affiche dans la barre d\'état ; barre ⇱ ✕ au-dessus des DevTools.',
    ],
    en: [
      'The keyboard stays in the terminal after a command.',
      'The + button opens a tab; clicking the address copies it.',
      'Zoom is shown in the status bar; ⇱ ✕ bar above DevTools.',
    ],
  },
];

// Notes de la version donnée (ou de la plus récente connue), dans la langue demandée.
function notesFor(version, lang = 'fr') {
  const e = CHANGELOG.find((x) => x.version === version) || CHANGELOG[0];
  return { version: e.version, notes: lang === 'en' && e.en ? e.en : e.notes };
}

// Notes d'une version précise, ou null si cette version n'est pas dans le journal.
function exactNotes(version, lang = 'fr') {
  const e = CHANGELOG.find((x) => x.version === version);
  return e ? (lang === 'en' && e.en ? e.en : e.notes) : null;
}

// Notes d'une Release GitHub (texte Markdown) : la section « Français » ou « English » si
// elle existe, sinon toutes les puces ; « … by @x in https://… » est retiré.
function releaseNotes(body, lang = 'fr') {
  const text = String(body || '').replace(/\r/g, '');
  const sections = text.split(/^#+\s*/m);
  const title = lang === 'en' ? /^english\b/i : /^fran[cç]ais\b/i;
  const own = sections.find((part) => title.test(part));
  return (own || text)
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/\s+by @\S+ in https?:\/\/\S+$/, '').trim())
    .filter(Boolean);
}

module.exports = { CHANGELOG, notesFor, exactNotes, releaseNotes };
