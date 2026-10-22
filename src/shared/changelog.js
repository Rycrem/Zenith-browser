'use strict';

// Notes de mise à jour affichées en bas de l'écran d'accueil (la version installée).
// Ajouter une entrée en tête à chaque nouvelle version : notes en français, en anglais dans `en`.
const CHANGELOG = [
  {
    version: '0.1.33',
    notes: [
      'Le code de Zenith est rangé en dossiers par fonctionnalité (onglets, split, terminal, extensions, mises à jour…). Rien ne change à l\'usage.',
    ],
    en: [
      'Zenith\'s code is now organized in folders by feature (tabs, split, terminal, extensions, updates…). Nothing changes in use.',
    ],
  },
  {
    version: '0.1.32',
    notes: [
      'Les captures d\'écran du README montrent le nouveau visuel de Zenith (logo, barre d\'adresse, barre d\'état).',
    ],
    en: [
      'The README screenshots show Zenith\'s new look (logo, address bar, status bar).',
    ],
  },
  {
    version: '0.1.30',
    notes: [
      'Le README indique le nom complet de l\'auteur de Zenith.',
    ],
    en: [
      'The README shows the full name of Zenith\'s author.',
    ],
  },
  {
    version: '0.1.29',
    notes: [
      'Si l\'interface (onglets, terminal) se bloque ou s\'arrête, elle se relance toute seule au bout de quelques secondes, sans fermer tes pages. Ses erreurs, ses blocages et les arrêts anormaux de Zenith sont notés dans zenith.log, avec un rapport de plantage local (jamais envoyé) dans le dossier Crashpad.',
      'Les extensions installées avant le renommage du dossier (« Extension directory not found » avec dev-brows dans le chemin) se rechargent depuis le dossier Zenith.',
    ],
    en: [
      'If the interface (tabs, terminal) freezes or stops, it restarts by itself after a few seconds without closing your pages. Its errors, freezes and abnormal Zenith shutdowns are written to zenith.log, with a local crash report (never sent) in the Crashpad folder.',
      'Extensions installed before the folder rename ("Extension directory not found" with dev-brows in the path) load again from the Zenith folder.',
    ],
  },
  {
    version: '0.1.28',
    notes: [
      'Les dossiers de Zenith ne s\'appellent plus dev-brows : tes données passent dans AppData\\Roaming\\Zenith au premier lancement, et l\'appli s\'installe dans AppData\\Local\\Programs\\Zenith (l\'ancien dossier est retiré).',
    ],
    en: [
      'Zenith folders are no longer named dev-brows: your data moves to AppData\\Roaming\\Zenith on first launch, and the app installs to AppData\\Local\\Programs\\Zenith (the old folder is removed).',
    ],
  },
  {
    version: '0.1.27',
    notes: [
      'La barre d\'adresse a une largeur fixe, deux fois celle qu\'elle avait sur l\'accueil ; elle n\'affiche toujours que le site, l\'adresse complète au clic.',
      'Ctrl+F marche partout : sur l\'historique, les favoris, l\'aide et les autres écrans, les résultats sont surlignés.',
      'Glisser un onglet : le contour animé revient, plus lent, en plus de la place qui s\'ouvre ; on peut aussi le poser tout au bout à droite.',
      'L\'installateur Windows affiche le détail de l\'installation dès le début (vérification, fichiers, réglages, raccourcis) et attend qu\'on clique sur Suivant.',
      'L\'installateur inscrit Zenith comme navigateur : il apparaît dans les applications par défaut de Windows et dans « Ouvrir avec » quand une autre appli ouvre un lien, sans passer par « default ».',
    ],
    en: [
      'The address box has a fixed width, twice what it had on the home screen; it still only shows the site, with the full address on click.',
      'Ctrl+F works everywhere: on history, bookmarks, help and the other screens, matches are highlighted.',
      'Dragging a tab: the animated outline is back, slower, along with the opening spot; a tab can also be dropped at the far right.',
      'The Windows installer shows the installation details from the start (check, files, settings, shortcuts) and waits for a click on Next.',
      'The installer registers Zenith as a browser: it shows up in Windows default apps and in “Open with” when another app opens a link, without running “default”.',
    ],
  },
  {
    version: '0.1.26',
    notes: [
      'Les flèches ‹ › qui changent d\'onglet sont au bout de la barre, à côté du bouton recharger de l\'adresse.',
    ],
    en: [
      'The ‹ › arrows that switch tabs sit at the end of the bar, next to the address reload button.',
    ],
  },
  {
    version: '0.1.25',
    notes: [
      'En split, chaque écran a ses propres onglets : la barre d\'onglets se divise comme le terminal, avec un + et des flèches de chaque côté. Ctrl+Tab ne passe que par les onglets de l\'écran actif.',
      'Les flèches ‹ › sont dans un petit cadre à droite du + et passent à l\'onglet précédent ou suivant.',
      'Glisser un onglet écarte doucement ses voisins pour montrer la place où il sera posé, puis il y glisse.',
      'Ctrl+Tab, Ctrl+Maj+Tab et les autres raccourcis marchent aussi quand le curseur est dans le terminal.',
      'L\'installateur Windows affiche de nouveau le détail de l\'installation (dossier, langue, mises à jour, raccourcis).',
      'La barre d\'adresse n\'affiche que le site (easyrea.atlassian.net) ; elle prend la largeur du site, au plus deux fois celle de l\'accueil. Un clic montre l\'adresse complète, et le bouton copier copie toujours le lien entier.',
    ],
    en: [
      'In split, each pane has its own tabs: the tab bar splits like the terminal, with a + and arrows on each side. Ctrl+Tab only goes through the active pane\'s tabs.',
      'The ‹ › arrows sit in a small box right of + and go to the previous or next tab.',
      'Dragging a tab gently slides its neighbours apart to show where it will land, then it slides into place.',
      'Ctrl+Tab, Ctrl+Shift+Tab and the other shortcuts also work while the cursor is in the terminal.',
      'The Windows installer shows the installation details again (folder, language, updates, shortcuts).',
      'The address box only shows the site (easyrea.atlassian.net); it takes the site\'s width, at most twice its width on the home screen. Click it to see the full address, and the copy button still copies the whole link.',
    ],
  },
  {
    version: '0.1.24',
    notes: [
      'dev-brows s\'appelle maintenant Zenith, avec un nouveau logo : le soleil orange sur fond noir. Tes données (favoris, historique, extensions) restent les mêmes ; le journal devient zenith.log.',
      'Ctrl+L vide le terminal, Ctrl+H y place le curseur. Ctrl+J qui rouvre le terminal y met aussi le curseur.',
      'La ligne de commande passe à la ligne quand elle est longue, et Ctrl+C annule la saisie en cours.',
      '« clicks » (ancien « links ») numérote aussi les champs de saisie : leur numéro y place le curseur.',
      'En split, chaque écran a son terminal juste en dessous, et Ctrl+Maj+N ne passe en navigation privée que l\'écran actif.',
      'Ctrl+F ouvre une petite barre de recherche en haut à droite de la page : Entrée va au premier résultat puis au suivant, ↓ ↑ pour avancer ou reculer, avec le compte (1/42).',
      'Chaque page en remplace une autre : ouvrir un résultat de recherche ne montre plus l\'ancienne page pendant le chargement, et « back » repasse par les résultats.',
      'Avec « ia », on peut continuer la discussion : une ligne « > » sous la réponse attend la suite, curseur déjà placé. L\'invite affiche simplement le nom de l\'IA.',
      'Clic droit sur + : les onglets fermés récemment ; Ctrl+Maj+T rouvre le dernier. « popback » rouvre les onglets de la dernière fois.',
      'Ctrl+clic sur un lien l\'ouvre dans un nouvel onglet sans quitter celui où tu es.',
      'Barre des onglets : l\'onglet choisi reste visible, un vrai anneau de chargement, des flèches quand les onglets débordent, un onglet glissé ne bouge que de gauche à droite avec un curseur à l\'endroit où il sera posé.',
      'L\'adresse prend la largeur de son texte, avec un bouton recharger collé à gauche et un nouveau logo pour copier.',
      'Ctrl+Maj+R (ou « reload hard ») recharge sans le cache.',
      '« default » fait de Zenith le navigateur par défaut ; un lien ouvert depuis une autre appli arrive dans un nouvel onglet.',
      '« config export » et « config import » enregistrent et rechargent tes réglages, favoris et extensions, pour passer d\'un ordinateur à l\'autre.',
      'La fenêtre se rouvre à sa place, sur l\'écran où tu l\'avais laissée, même après l\'avoir réduite.',
      'Le player du son disparaît quand plus aucun onglet ne joue.',
      'Le bouton « dossier » d\'un téléchargement ouvre toujours le dossier, même pendant le téléchargement.',
      'L\'installateur Windows montre le détail de ce qu\'il fait.',
      'Le bloqueur de pub de secours (« adblock ») est retiré : uBlock Origin s\'en occupe. L\'interface envoie moins de mises à jour et ses commandes internes ne répondent qu\'à elle.',
    ],
    en: [
      'dev-brows is now called Zenith, with a new logo: the orange sun on a black background. Your data (bookmarks, history, extensions) stays the same; the log becomes zenith.log.',
      'Ctrl+L clears the terminal, Ctrl+H puts the cursor in it. Ctrl+J bringing the terminal back also puts the cursor there.',
      'The command line wraps when it gets long, and Ctrl+C cancels what you are typing.',
      '“clicks” (formerly “links”) also numbers input fields: their number puts the cursor in them.',
      'In split view, each pane has its own terminal right below it, and Ctrl+Shift+N switches only the active pane to private browsing.',
      'Ctrl+F opens a small find bar at the top right of the page: Enter goes to the first result then the next, ↓ ↑ to move forward or back, with the count (1/42).',
      'Each page replaces the previous one: opening a search result no longer shows the old page while loading, and “back” goes through the results again.',
      'With “ia”, you can carry on the conversation: a “>” line under the answer waits for your reply, cursor already there. The prompt simply shows the AI name.',
      'Right-click on +: recently closed tabs; Ctrl+Shift+T reopens the last one. “popback” reopens the tabs from last time.',
      'Ctrl+click on a link opens it in a new tab without leaving the current one.',
      'Tab bar: the selected tab stays visible, a real loading ring, arrows when tabs overflow, a dragged tab only moves left and right with a cursor where it will land.',
      'The address takes the width of its text, with a reload button on its left and a new copy icon.',
      'Ctrl+Shift+R (or “reload hard”) reloads without the cache.',
      '“default” makes Zenith the default browser; a link opened from another app arrives in a new tab.',
      '“config export” and “config import” save and load your settings, bookmarks and extensions, to move from one computer to another.',
      'The window reopens where it was, on the screen where you left it, even after minimizing it.',
      'The sound player disappears when no tab is playing anymore.',
      'A download’s “folder” button always opens the folder, even while downloading.',
      'The Windows installer shows the details of what it does.',
      'The fallback ad blocker (“adblock”) is removed: uBlock Origin handles ads. The interface sends fewer updates and its internal commands only answer it.',
    ],
  },
  {
    version: '0.1.23',
    notes: [
      'Un journal, dev-brows.log dans le dossier de données, note chaque lancement, le chargement de chaque extension et les plantages.',
      'Si dev-brows plante pendant son démarrage, le lancement suivant désactive l\'extension en cause (ou toutes, si on ne sait pas laquelle) et le dit dans le terminal.',
      'Electron passe en 44.9.3 : les certificats intermédiaires eMudhra compromis ne sont plus acceptés.',
    ],
    en: [
      'A log, dev-brows.log in the data folder, records each launch, the loading of each extension and any crash.',
      'If dev-brows crashes while starting, the next launch disables the extension at fault (or all of them when it cannot tell which) and says so in the terminal.',
      'Electron is updated to 44.9.3: the compromised eMudhra intermediate certificates are no longer trusted.',
    ],
  },
  {
    version: '0.1.22',
    notes: [
      'Nouveau logo pour le bouton qui copie l\'adresse : deux feuilles, celle de devant avec un coin plié.',
      'Le bouton « Ajouter à Chrome » du Chrome Web Store marche, comme dans Brave : dev-brows demande confirmation puis installe l\'extension (« Supprimer de Chrome » la désinstalle). Si le store change et que ce bouton ne répond plus, un bouton « Ajouter à dev-brows » apparaît en bas à droite.',
      'Les extensions qui rangent leurs réglages dans chrome.storage.sync (SponsorBlock…) fonctionnent : ils sont gardés sur l\'ordinateur.',
      'Nouvelles API pour les extensions : capture de l\'onglet, historique, favoris, liste des extensions, recherche, connexion OAuth (identity), panneau latéral, téléchargements ; les autres (groupes d\'onglets, sessions…) répondent vide au lieu de planter.',
      'En glissant un onglet, le bord droit de l\'onglet de gauche et le bord gauche de celui de droite s\'allument : on voit exactement où il sera posé.',
    ],
    en: [
      'New icon for the copy-address button: two sheets, the front one with a folded corner.',
      'The Chrome Web Store “Add to Chrome” button works, as in Brave: dev-brows asks for confirmation, then installs the extension (“Remove from Chrome” uninstalls it). If the store changes and that button stops responding, an “Add to dev-brows” button appears at the bottom right.',
      'Extensions that keep their settings in chrome.storage.sync (SponsorBlock…) now work: the settings are kept on the computer.',
      'New extension APIs: tab capture, history, bookmarks, extension list, search, OAuth sign-in (identity), side panel, downloads; the others (tab groups, sessions…) answer empty instead of crashing.',
      'While dragging a tab, the right edge of the tab on the left and the left edge of the tab on the right light up, showing exactly where it will land.',
    ],
  },
  {
    version: '0.1.21',
    notes: [
      'Le player du son tient dans une seule carte : lecture/pause à gauche, le volume, son pourcentage (un clic coupe ou remet le son), puis ▴ pour le son de chaque onglet.',
    ],
    en: [
      'The sound player fits in a single card: play/pause on the left, the volume, its percentage (click to mute or unmute), then ▴ for each tab\'s sound.',
    ],
  },
  {
    version: '0.1.20',
    notes: [
      'En tapant dans l\'adresse, des pages de ton historique sont proposées : ↑/↓ pour choisir, clic ou Entrée pour y aller.',
      'L\'adresse est plus compacte et alignée à droite.',
      'Le bouton soleil/lune prend la place de l\'heure et a la même hauteur que les extensions épinglées.',
      'Le player du son a un bouton lecture/pause, un bouton muet et un curseur de volume avec son pourcentage.',
      'Une vidéo en plein écran prend toute la fenêtre : les onglets et la barre d\'état disparaissent.',
      'Dans la popup des favoris, un glisser-déposer les range : avant, après ou dans un dossier.',
      'Dashlane détecte à nouveau les champs de connexion : les extensions sont prévenues quand un onglet est affiché.',
    ],
    en: [
      'Typing in the address suggests pages from your history: ↑/↓ to pick, click or Enter to go.',
      'The address is more compact and right-aligned.',
      'The sun/moon button replaces the clock and matches the height of pinned extensions.',
      'The sound player has a play/pause button, a mute button and a volume slider with its percentage.',
      'A fullscreen video takes the whole window: tabs and the status bar disappear.',
      'In the bookmarks popup, drag and drop reorders them: before, after or into a folder.',
      'Dashlane detects login fields again: extensions are told when a tab is shown.',
    ],
  },
  {
    version: '0.1.19',
    notes: [
      'L\'adresse en haut se modifie à la main : Entrée pour y aller, Échap pour annuler.',
      'Un bouton copier à droite de l\'adresse la copie et affiche « copié ».',
      'Navigation privée avec Ctrl+Maj+N (ou « private ») : fond violet sombre, accent rouge, onglets à part, rien dans l\'historique, tout est effacé en sortant. Les extensions y fonctionnent.',
      'Ctrl+Entrée lance l\'adresse ou la recherche dans un nouvel onglet, depuis le terminal comme depuis la barre d\'adresse.',
    ],
    en: [
      'The address at the top can be edited by hand: Enter to go, Esc to cancel.',
      'A copy button right of the address copies it and shows “copied”.',
      'Private browsing with Ctrl+Shift+N (or “private”): dark purple background, red accent, separate tabs, nothing in history, everything wiped on exit. Extensions work there.',
      'Ctrl+Enter opens the address or search in a new tab, from the terminal and from the address bar.',
    ],
  },
  {
    version: '0.1.18',
    notes: [
      'Un onglet qui joue du son affiche un haut-parleur : un clic coupe ou remet son son.',
      'Pendant une musique ou une vidéo, un player remplace l\'heure : son curseur règle le volume du navigateur, un clic sur la barre de son ouvre le contrôle de chaque onglet (lecture/pause, muet, volume).',
      '« update » affiche un récapitulatif de ce qu\'apporte la mise à jour proposée.',
      'Un second clic sur la pastille d\'une extension ferme sa popup au lieu de la rouvrir.',
      'Les extensions ne s\'injectent plus dans l\'interface de dev-brows.',
      'Nouvelle icône pour le bouton des téléchargements.',
      'Une extension sans popup (Elasticvue…) réagit maintenant au clic sur sa pastille, par exemple en ouvrant sa page.',
      'Les onglets montent dans la barre de titre, noire, à côté des boutons de la fenêtre.',
      'Mode nuit par défaut et mode jour : le bouton soleil/lune à droite du son (ou « mode jour|nuit ») passe de l\'un à l\'autre.',
      'Bouton puzzle (ou Ctrl+Maj+E) : la popup des extensions, avec une ★ pour épingler celles qui restent dans la barre du bas.',
    ],
    en: [
      'A tab playing sound shows a speaker: click it to mute or unmute the tab.',
      'While music or a video plays, a player replaces the clock: its slider sets the browser volume, and a click on its sound bars opens per-tab controls (play/pause, mute, volume).',
      '“update” shows a recap of what the proposed update brings.',
      'A second click on an extension badge closes its popup instead of reopening it.',
      'Extensions no longer inject into dev-brows\'s own interface.',
      'New icon for the downloads button.',
      'An extension without a popup (Elasticvue…) now reacts to a click on its badge, for example by opening its page.',
      'Tabs move up into the black title bar, next to the window buttons.',
      'Night mode by default and a day mode: the sun/moon button right of the sound (or “mode jour|nuit”) switches between them.',
      'Puzzle button (or Ctrl+Shift+E): the extensions popup, with a ★ to pin the ones that stay in the bottom bar.',
    ],
  },
  {
    version: '0.1.17',
    notes: [
      'Bouton ↓ à droite des extensions (ou Ctrl+Maj+J) : les téléchargements en popup, avec une roue de progression, le poids, la vitesse et le temps restant.',
      'Bouton ★ favoris en bas à gauche (ou Ctrl+Maj+B) : tes favoris en popup, avec un filtre.',
      '« fav import » importe les favoris de Chrome, Edge, Brave, Vivaldi, Opera, Firefox ou d\'un export HTML.',
      'L\'accueil se met à jour tout de suite quand un favori est ajouté, déplacé ou supprimé.',
      '« ext log n » montre les erreurs d\'une extension (fond, popup, scripts dans les pages), pour comprendre pourquoi elle ne marche pas.',
    ],
    en: [
      '↓ button right of the extensions (or Ctrl+Shift+J): downloads in a popup, with a progress ring, size, speed and time left.',
      '★ bookmarks button at the bottom left (or Ctrl+Shift+B): your bookmarks in a popup, with a filter.',
      '“fav import” imports bookmarks from Chrome, Edge, Brave, Vivaldi, Opera, Firefox or an HTML export.',
      'The home screen updates right away when a bookmark is added, moved or removed.',
      '“ext log n” shows an extension\'s errors (background, popup, scripts in pages), to understand why it does not work.',
    ],
  },
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
