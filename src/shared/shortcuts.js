'use strict';

// Raccourcis clavier de Zenith, modifiables dans « settings keys » (commande « keys »).
// Tout nouveau raccourci s'ajoute ici et nulle part ailleurs : le menu, l'aide, Nadir et la page
// des réglages sont construits à partir de cette liste (un test refuse un raccourci écrit en dur).
// keys : raccourcis par défaut, au format des accélérateurs d'Electron ; le premier est affiché.
// menu: false : raccourci lu à la main (before-input-event), pas par le menu.
const SHORTCUTS = [
  { id: 'terminal', label: 'aller au terminal', keys: ['CmdOrCtrl+K'] },
  { id: 'history', label: 'historique', keys: ['CmdOrCtrl+H'] },
  { id: 'clear', label: 'vider le terminal', keys: ['CmdOrCtrl+L'] },
  { id: 'toggle-terminal', label: 'cacher / montrer le terminal', keys: ['CmdOrCtrl+`'], menu: false },
  { id: 'fullscreen', label: 'plein écran', keys: ['F11'] },
  { id: 'new-tab', label: 'nouvel onglet', keys: ['CmdOrCtrl+T'] },
  { id: 'close-tab', label: 'fermer l\'onglet', keys: ['CmdOrCtrl+W'] },
  { id: 'reopen-tab', label: 'rouvrir l\'onglet fermé', keys: ['CmdOrCtrl+Shift+T'] },
  { id: 'next-tab', label: 'onglet suivant', keys: ['Ctrl+Tab'] },
  { id: 'prev-tab', label: 'onglet précédent', keys: ['Ctrl+Shift+Tab'] },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `tab-${n}`, label: 'onglet {n}', n, keys: [`CmdOrCtrl+${n}`] })),
  { id: 'back', label: 'page précédente', keys: ['Alt+Left'] },
  { id: 'forward', label: 'page suivante', keys: ['Alt+Right'] },
  { id: 'reload', label: 'recharger', keys: ['F5', 'CmdOrCtrl+R'] },
  { id: 'hard-reload', label: 'recharger sans le cache', keys: ['CmdOrCtrl+Shift+R'] },
  { id: 'find', label: 'chercher dans la page', keys: ['CmdOrCtrl+F'] },
  { id: 'bookmark', label: 'ajouter aux favoris', keys: ['CmdOrCtrl+D'] },
  { id: 'split', label: 'split', keys: ['CmdOrCtrl+Shift+S'] },
  { id: 'switch-pane', label: 'changer d\'écran', keys: ['F6'] },
  { id: 'devtools', label: 'outils de développement', keys: ['F12', 'CmdOrCtrl+Shift+I'] },
  { id: 'inspect', label: 'sélectionner un élément de la page et le voir dans le HTML', keys: ['CmdOrCtrl+Shift+C'] },
  { id: 'downloads', label: 'téléchargements', keys: ['CmdOrCtrl+J', 'CmdOrCtrl+Shift+J'] },
  { id: 'favorites', label: 'favoris', keys: ['CmdOrCtrl+Shift+B'] },
  { id: 'extensions', label: 'extensions', keys: ['CmdOrCtrl+Shift+E'] },
  { id: 'nadir', label: 'Nadir, l\'assistant', keys: ['CmdOrCtrl+Shift+A'] },
  { id: 'mobile', label: 'mode mobile', keys: ['CmdOrCtrl+Alt+M'] },
  { id: 'private', label: 'navigation privée', keys: ['CmdOrCtrl+Shift+N'] },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `ext-${n}`, label: 'popup de l\'extension {n}', n, keys: [`Alt+${n}`] })),
  { id: 'zoom-in', label: 'zoom +', keys: ['CmdOrCtrl+=', 'CmdOrCtrl+Plus'] },
  { id: 'zoom-out', label: 'zoom -', keys: ['CmdOrCtrl+-'] },
  { id: 'zoom-reset', label: 'zoom normal', keys: ['CmdOrCtrl+0'] },
];

const BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));

const MODS = { cmdorctrl: 'CmdOrCtrl', commandorcontrol: 'CmdOrCtrl', ctrl: 'CmdOrCtrl', control: 'CmdOrCtrl', cmd: 'CmdOrCtrl', command: 'CmdOrCtrl', alt: 'Alt', option: 'Alt', shift: 'Shift', maj: 'Shift' };
const NAMES = {
  left: 'Left', '←': 'Left', arrowleft: 'Left', right: 'Right', '→': 'Right', arrowright: 'Right', up: 'Up', '↑': 'Up', arrowup: 'Up', down: 'Down', '↓': 'Down', arrowdown: 'Down',
  tab: 'Tab', space: 'Space', ' ': 'Space', enter: 'Enter', return: 'Enter', entrée: 'Enter', backspace: 'Backspace', delete: 'Delete', suppr: 'Delete', insert: 'Insert', home: 'Home', end: 'End', fin: 'End',
  pageup: 'PageUp', pagedown: 'PageDown', escape: 'Escape', esc: 'Escape', échap: 'Escape', plus: 'Plus', '²': '`', backquote: '`',
};
const ORDER = ['CmdOrCtrl', 'Alt', 'Shift'];

// « ctrl+maj+x », « Ctrl+Shift+X »… → « CmdOrCtrl+Shift+X », ou null si ce n'est pas un raccourci.
// Une touche seule n'est acceptée que si c'est une touche de fonction (F1…F24) : sinon elle
// empêcherait de taper ce caractère.
function normalize(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().replace(/\+\+$/, '+Plus').split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const mods = new Set();
  for (const p of parts.slice(0, -1)) {
    const m = MODS[p.toLowerCase()];
    if (!m) return null;
    mods.add(m);
  }
  const raw = parts[parts.length - 1];
  const low = raw.toLowerCase();
  let key;
  if (NAMES[low]) key = NAMES[low];
  else if (/^f([1-9]|1\d|2[0-4])$/.test(low)) key = low.toUpperCase();
  else if (/^[a-z0-9]$/.test(low)) key = low.toUpperCase();
  else if (/^[=\-,.;/\\[\]'`]$/.test(raw)) key = raw;
  else return null;
  if (!mods.size && !/^F\d+$/.test(key)) return null;
  return [...ORDER.filter((m) => mods.has(m)), key].join('+');
}

// Ctrl+Tab est écrit « Ctrl » (pas CmdOrCtrl) dans le menu : même touche sur Windows et Linux.
const same = (a, b) => normalize(a) === normalize(b);

// Raccourcis en vigueur : ceux par défaut, remplacés par ceux choisis (custom : { id: [touches] }).
function effective(custom) {
  const out = {};
  for (const s of SHORTCUTS) {
    const c = custom && Array.isArray(custom[s.id]) ? custom[s.id] : null;
    out[s.id] = c || s.keys;
  }
  return out;
}

// Le raccourci qui utilise déjà ces touches (autre que id), ou null.
function conflict(custom, id, accel) {
  const keys = effective(custom);
  return SHORTCUTS.find((s) => s.id !== id && keys[s.id].some((k) => same(k, accel))) || null;
}

// Pour l'affichage : « CmdOrCtrl+Shift+Left » → « Ctrl+Maj+← » (shift : le mot à mettre pour Maj).
function display(accel, shift = 'Maj') {
  const n = normalize(accel) || accel;
  return n.split('+').map((p) => ({
    CmdOrCtrl: 'Ctrl', Shift: shift, Left: '←', Right: '→', Up: '↑', Down: '↓', '`': '²', Plus: '+',
  }[p] || p)).join('+');
}

// La touche reçue (before-input-event d'Electron) correspond-elle à ce raccourci ?
// La touche ² est lue par sa place (code Backquote) : son caractère change selon le clavier.
function matches(input, accel) {
  if (!input || input.type !== 'keyDown') return false;
  const n = normalize(accel);
  if (!n) return false;
  const parts = n.split('+');
  const key = parts.pop();
  const ctrl = parts.includes('CmdOrCtrl');
  if (ctrl !== !!(input.control || input.meta) || parts.includes('Alt') !== !!input.alt || parts.includes('Shift') !== !!input.shift) return false;
  if (key === '`') return input.code === 'Backquote';
  if (/^\d$/.test(key)) return input.code === `Digit${key}` || input.key === key;
  const k = { Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Space: ' ', Plus: '+' }[key] || key;
  return String(input.key).toLowerCase() === k.toLowerCase();
}

module.exports = { SHORTCUTS, BY_ID, normalize, effective, conflict, display, matches };
