'use strict';

const api = window.brows;
const { t, mark, setLang, getLang } = window.I18N;
setLang(api.lang);
const locale = () => (getLang() === 'en' ? 'en-US' : 'fr-FR');
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const content = $('#content');
const panesEl = [...document.querySelectorAll('.pane')];
// Un terminal sous chaque écran : en split, chacun a sa ligne de commande.
const cols = [...document.querySelectorAll('.term-col')].map((el) => ({ el, scrollback: $('.scrollback', el), form: $('.prompt', el), input: $('.input', el), ps1: $('.ps1', el) }));

let state = null;
const activeCol = () => cols[state && cols[state.activePane] ? state.activePane : 0];
const isField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
let awaiting = false; // « (O/n) » ou « (o/N) » (« (Y/n) » en anglais) quand une question attend une réponse
const cmdHistory = load('cmdHistory', []);
let histIndex = cmdHistory.length;

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : tant pis
  }
}

// Petit constructeur d'éléments : h('div', { class: 'x', onclick }, 'texte', enfant…)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren sans les valeurs vides et avec les tableaux aplatis.
// Haut-parleur en SVG (même rendu partout) : avec ondes, ou barré quand le son est coupé.
function speaker(muted) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'speaker-icon');
  const path = (d, fill) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    return p;
  };
  svg.append(path('M2 6h3l4-3v10l-4-3H2z', true));
  if (muted) svg.append(path('M11 6l4 4M15 6l-4 4'));
  else svg.append(path('M11 5.5a3.5 3.5 0 0 1 0 5'), path('M12.8 3.5a6 6 0 0 1 0 9'));
  return svg;
}

// Icône de téléchargement : flèche vers le bas au-dessus d'une barre arrondie.
function downloadIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'dl-icon');
  for (const d of ['M8 1.8v8.4', 'M4.4 6.8L8 10.4l3.6-3.6', 'M3.6 13.4h8.8']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function copyIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'copy-icon');
  // Deux cartes arrondies décalées : celle de devant pleine de la couleur du fond.
  for (const d of ['M5.5 5.5h7a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 13V7a1.5 1.5 0 0 1 1.5-1.5z', 'M2 10V3.5A1.5 1.5 0 0 1 3.5 2H10']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.4');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
  }
  return svg;
}

function reloadIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'copy-icon');
  for (const d of ['M13 8a5 5 0 1 1-1.46-3.54', 'M13 2.5v3h-3']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function puzzleIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M6 3.2a1.6 1.6 0 0 1 3.2 0V4.4h3.4v3.4h-1.2a1.6 1.6 0 0 0 0 3.2h1.2v3.4H9.2v-1.2a1.6 1.6 0 0 0-3.2 0v1.2H2.6v-3.4h1.2a1.6 1.6 0 0 0 0-3.2H2.6V4.4H6z');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

// Lune en mode jour (passer en nuit), soleil en mode nuit (passer en jour).
function modeIcon(light) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  const d = light
    ? ['M13.2 9.6A5.6 5.6 0 1 1 6.4 2.8a4.4 4.4 0 0 0 6.8 6.8z']
    : ['M8 5.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6z', 'M8 1.2v1.4', 'M8 13.4v1.4', 'M1.2 8h1.4', 'M13.4 8h1.4', 'M3.2 3.2l1 1', 'M11.8 11.8l1 1', 'M3.2 12.8l1-1', 'M11.8 4.2l1-1'];
  for (const x of d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', x);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function fill(el, children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

// ------------------------------------------------ terminal

// Un terminal par onglet, affiché sous l'écran qui montre cet onglet ; l'historique des commandes (↑ ↓) reste commun.
const terms = new Map(); // id d'onglet → div du terminal
let termId = null;

function term(id = termId) {
  let el = terms.get(id);
  if (!el) {
    el = h('div', { class: 'term' });
    el.hidden = id !== termId;
    terms.set(id, el);
    cols[0].scrollback.append(el);
  }
  return el;
}

const toBottom = (el) => {
  if (el.parentNode) el.parentNode.scrollTop = el.parentNode.scrollHeight;
};

// Range les terminaux sous leur écran ; ceux des onglets fermés disparaissent.
function placeTerms() {
  const alive = new Set(state.tabs.map((tb) => tb.id));
  for (const [k, el] of terms) {
    if (k !== null && !alive.has(k)) {
      el.remove();
      terms.delete(k);
    }
  }
  const id = state.panes[state.activePane].tabId;
  // Les messages d'avant le premier état vont au premier onglet.
  if (termId === null && terms.has(null) && !terms.has(id)) {
    terms.set(id, terms.get(null));
    terms.delete(null);
  }
  termId = id;
  const shown = new Map(state.panes.map((p, i) => [p.tabId, i]));
  state.panes.forEach((p, i) => {
    const el = term(p.tabId);
    if (el.parentNode !== cols[i].scrollback) {
      cols[i].scrollback.append(el);
      el.hidden = false;
      toBottom(el);
    }
  });
  for (const [k, el] of terms) {
    const was = el.hidden;
    el.hidden = !shown.has(k);
    if (was && !el.hidden) toBottom(el);
  }
}

function print(lines, el = term()) {
  for (const l of lines) {
    el.append(h('div', { class: l.c || '' }, l.t));
    if (l.c === 'warn' && l.t.trim().startsWith('?')) awaiting = (l.t.match(/\([^()]*\)$/) || [t('(O/n)')])[0];
  }
  while (el.childElementCount > 600) el.firstElementChild.remove();
  toBottom(el);
  renderPs1();
}

// La clé API ne doit apparaître ni à l'écran ni dans l'historique des commandes.
const SECRET = /^(\s*(?:ia|ai)\s+(?:key|connect\s+\S+)\s+)\S+/i;
const masked = (line) => line.replace(SECRET, '$1••••••••');

// La ligne de commande s'agrandit quand le texte passe à la ligne.
function grow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}

function setInput(ta, value) {
  ta.value = value;
  grow(ta);
}

async function run(line, { echo = true, newTab = false } = {}) {
  const pane = state ? state.activePane : 0;
  const el = term();
  if (echo) print([{ t: `❯ ${masked(line)}`, c: 'cmd' }], el);
  awaiting = false;
  renderPs1();
  const res = await api.exec(line, { newTab, pane });
  if (res.clear) el.replaceChildren();
  print(res.lines, el.isConnected ? el : term());
  if (res.hideTerminal) setTerminalHidden(true);
  // Sauf si la commande a donné le clavier à la page (« clicks » sur un champ) ou à la réponse de l'IA.
  else if (document.hasFocus() && (!isField(document.activeElement) || document.activeElement.classList.contains('input'))) activeCol().input.focus();
}

function renderPs1() {
  cols.forEach((c, i) => {
    const p = state && state.panes[i];
    if (awaiting && (!state || i === state.activePane)) {
      c.ps1.replaceChildren(h('span', { class: 'warn' }, awaiting), ' ', h('span', { class: 'acc' }, '❯'));
      return;
    }
    const host = p ? p.host || t('accueil') : '…';
    c.ps1.replaceChildren(
      h('span', { class: 'user' }, state ? state.user : ''),
      h('span', { class: 'dim' }, '@'),
      h('span', { class: 'host' }, host),
      ' ',
      h('span', { class: 'acc' }, '❯'),
    );
  });
}

$('#url-reload').append(reloadIcon());
$('#url-reload').addEventListener('click', () => run('reload', { echo: false }));

// L'adresse en haut se modifie à la main (Entrée : y aller, Échap : annuler) ; le bouton à droite la copie.
// En tapant, l'historique propose des pages (↑/↓ pour choisir, clic pour y aller).
const urlInput = $('#url');
let suggestions = [];
let suggestSel = -1;
let suggestTyped = '';
const urlRect = () => {
  const r = $('#url-form').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};
function closeSuggest() {
  suggestions = [];
  suggestSel = -1;
  api.suggestHide();
}
$('#url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  closeSuggest();
  urlInput.blur();
  if (!url || url === state.status.url) return;
  await run(`go ${url}`);
  api.focusPage();
});
urlInput.addEventListener('focus', () => urlInput.select());
urlInput.addEventListener('input', async () => {
  suggestTyped = urlInput.value;
  suggestSel = -1;
  const list = await api.suggest(urlInput.value, urlRect());
  if (document.activeElement === urlInput) suggestions = list;
  else api.suggestHide();
});
urlInput.addEventListener('keydown', async (e) => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
    e.preventDefault();
    const n = suggestions.length;
    // -1 : ce qui a été tapé ; 0..n-1 : une suggestion.
    suggestSel = ((suggestSel + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n + 1) % (n + 1)) - 1;
    urlInput.value = suggestSel >= 0 ? suggestions[suggestSel].url : suggestTyped;
    api.suggestSelect(suggestSel, urlRect());
    return;
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const url = urlInput.value.trim();
    closeSuggest();
    urlInput.blur();
    if (url) await run(`tab new ${url}`);
    return;
  }
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (suggestions.length) {
    urlInput.value = suggestTyped;
    closeSuggest();
    return;
  }
  urlInput.value = state.status.url;
  urlInput.blur();
});
urlInput.addEventListener('blur', () => {
  urlInput.value = state.status.url;
  // Laisse passer un clic sur une suggestion avant de fermer la liste.
  setTimeout(() => { if (document.activeElement !== urlInput) closeSuggest(); }, 200);
});
api.on('suggest:done', () => urlInput.blur());
let copiedTimer = null;
$('#url-copy').append(copyIcon());
$('#url-copy').addEventListener('click', () => {
  const url = state.status.url;
  if (!url) return;
  api.writeClipboard(url);
  const tip = $('#copied');
  tip.hidden = false;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { tip.hidden = true; }, 1200);
});

// Ctrl+Entrée : la commande (adresse, recherche…) s'ouvre dans un nouvel onglet.
let newTabNext = false;
cols.forEach((c, i) => {
  c.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newTab = newTabNext && !awaiting;
    newTabNext = false;
    const line = c.input.value;
    setInput(c.input, '');
    if (line.trim() && !awaiting && !SECRET.test(line) && cmdHistory[cmdHistory.length - 1] !== line) {
      cmdHistory.push(line);
      if (cmdHistory.length > 300) cmdHistory.shift();
      persist('cmdHistory', cmdHistory);
    }
    histIndex = cmdHistory.length;
    run(line, { newTab });
  });
  // Écrire sous un écran le rend actif.
  c.input.addEventListener('focus', () => state && state.activePane !== i && state.panes[i] && api.pane(i));
  // Un collage sur plusieurs lignes reste une seule commande.
  c.input.addEventListener('input', () => {
    if (/[\r\n]/.test(c.input.value)) {
      const pos = c.input.selectionStart;
      c.input.value = c.input.value.replace(/\r?\n/g, ' ');
      c.input.setSelectionRange(pos, pos);
    }
    grow(c.input);
  });
  c.input.addEventListener('keydown', async (e) => {
    const ta = c.input;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) newTabNext = true;
      c.form.requestSubmit();
    } else if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      // Ctrl+C sans sélection annule la saisie, comme dans un terminal.
      e.preventDefault();
      if (ta.value) print([{ t: `❯ ${masked(ta.value)}^C`, c: 'cmd' }]);
      setInput(ta, '');
      histIndex = cmdHistory.length;
    } else if (e.ctrlKey || e.altKey || e.metaKey) {
      // Les autres raccourcis (Ctrl+Tab, Alt+←…) restent ceux du navigateur.
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      histIndex = Math.max(0, Math.min(cmdHistory.length, histIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      setInput(ta, cmdHistory[histIndex] || '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const res = await api.complete(ta.value);
      setInput(ta, res.line);
      if (res.options.length) print([{ t: `  ${res.options.join('   ')}`, c: 'dim' }]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput(ta, '');
      api.focusPage();
    }
  });
});

// Taper n'importe où dans l'interface renvoie au terminal.
document.addEventListener('keydown', (e) => {
  if (isField(e.target) || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  activeCol().input.focus();
});

function setTerminalHidden(hidden) {
  app.classList.toggle('term-hidden', hidden);
  persist('termHidden', hidden);
  if (hidden) api.focusPage();
  else activeCol().input.focus();
  requestAnimationFrame(sendRects);
}

api.on('term:print', print);
// Popups de la barre du bas, au-dessus de leur bouton : ↓ (bord droit) ou ★ (bord gauche).
function openPanel(kind) {
  const b = $({ dl: '#dl-chip', fav: '#fav-chip', audio: '#audio-chip', ext: '#ext-chip' }[kind]);
  const r = b && b.getBoundingClientRect();
  api.panel(kind, r ? (kind === 'fav' ? r.left : r.right) : undefined);
}
// Ctrl+Maj+J, Ctrl+Maj+B et Ctrl+Maj+E.
api.on('ui:panel', openPanel);
api.on('term:clear', () => term().replaceChildren());
api.on('term:toggle', () => setTerminalHidden(!app.classList.contains('term-hidden')));
api.on('term:focus', (prefill) => {
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  const ta = activeCol().input;
  if (prefill) setInput(ta, prefill);
  ta.focus();
});

// ------------------------------------------------ redimensionnement à la souris

function dragger(handle, onMove, onEnd) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // la capture n'est pas indispensable : on écoute aussi la fenêtre
    }
    handle.classList.add('dragging');
    api.drag(true); // les pages sont masquées pendant le glissement pour garder la souris
    const move = (ev) => {
      onMove(ev);
      sendRects();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
      handle.classList.remove('dragging');
      api.drag(false);
      onEnd();
      sendRects();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
  });
}

let termH = load('termH', 220);
let ratio = load('paneRatio', 0.5);
document.documentElement.style.setProperty('--term-h', `${termH}px`);
document.documentElement.style.setProperty('--ratio', ratio);
if (load('termHidden', false)) app.classList.add('term-hidden');

dragger($('#resizer'), (e) => {
  termH = Math.round(Math.min(Math.max(window.innerHeight - e.clientY - 28, 70), window.innerHeight - 140));
  document.documentElement.style.setProperty('--term-h', `${termH}px`);
}, () => persist('termH', termH));

$('#resizer').addEventListener('dblclick', () => {
  termH = 220;
  document.documentElement.style.setProperty('--term-h', '220px');
  persist('termH', termH);
  requestAnimationFrame(sendRects);
});

dragger($('.pane-resizer'), (e) => {
  const r = content.getBoundingClientRect();
  ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0.15), 0.85);
  document.documentElement.style.setProperty('--ratio', ratio);
  alignTabGroups();
}, () => persist('paneRatio', ratio));

// Envoyé seulement quand la place des écrans change : chaque envoi replace toutes les pages.
let sentRects = '';
function sendRects() {
  alignTabGroups();
  const split = state && state.panes.length > 1;
  const rects = panesEl.map((p, i) => {
    if (i > 0 && !split) return null;
    const r = $('.viewport', p).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const key = JSON.stringify(rects);
  if (key === sentRects) return;
  sentRects = key;
  api.layout(rects);
}

new ResizeObserver(sendRects).observe(content);
window.addEventListener('resize', sendRects);

// ------------------------------------------------ rendu de l'état

api.on('state', (s) => {
  state = s;
  if (s.lang && s.lang !== getLang()) {
    setLang(s.lang);
    applyStaticLabels();
  }
  document.documentElement.style.setProperty('--accent', s.accent);
  document.documentElement.dataset.mode = s.light ? 'jour' : 'nuit';
  document.documentElement.dataset.platform = s.platform;
  if (s.private) document.documentElement.dataset.private = '1';
  else delete document.documentElement.dataset.private;
  $('.logo').textContent = s.private ? t('Zenith · privé') : 'Zenith';
  app.classList.toggle('split', s.panes.length > 1);
  placeTerms();
  renderTabs();
  renderPanes();
  renderStatus();
  renderPs1();
  requestAnimationFrame(sendRects);
});

// Une barre d'onglets par écran : en split, elle se divise comme le terminal, chaque côté avec
// ses onglets, son + et ses flèches (onglet précédent / suivant).
const groups = [...document.querySelectorAll('.tab-group')].map((el) => ({ el, strip: $('.tab-strip', el), prev: $('.tab-prev', el), next: $('.tab-next', el), shownId: null }));
groups.forEach((g, i) => {
  const plus = $('.new-tab', g.el);
  plus.addEventListener('click', () => api.newTab(i));
  // Clic droit sur + : les onglets fermés récemment.
  plus.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.recentMenu();
  });
  g.prev.addEventListener('click', () => api.cycleTab(i, -1));
  g.next.addEventListener('click', () => api.cycleTab(i, 1));
  // La molette fait défiler les onglets de côté.
  g.strip.addEventListener('wheel', (e) => {
    if (!e.deltaY || e.deltaX) return;
    e.preventDefault();
    g.strip.scrollBy({ left: e.deltaY });
  }, { passive: false });
});

// La séparation des deux barres tombe sur celle des écrans.
function alignTabGroups() {
  const g = groups[0].el;
  if (!state || state.panes.length < 2) {
    g.style.flex = '';
    return;
  }
  const edge = $('.pane-resizer').getBoundingClientRect().left;
  g.style.flex = `0 0 ${Math.max(80, Math.round(edge - g.getBoundingClientRect().left))}px`;
}

// Glisser un onglet : il suit la souris de gauche à droite, et ses voisins s'écartent doucement
// pour ouvrir la place où il sera posé. Lâché, il glisse dans cette place.
const TAB_SLIDE_MS = 320;
let tabDrag = null; // { id, side, el, strip, startX, moved, from, pos, w, others, center, min, max, dropping }

function slotShift(d, i) {
  if (d.from < i && i <= d.pos) return -d.w;
  if (d.pos <= i && i < d.from) return d.w;
  return 0;
}

function startTabDrag(e, tb) {
  if (e.button !== 0 || tabDrag || e.target.closest('.close, .speaker')) return;
  const el = e.currentTarget;
  const strip = el.parentNode;
  const els = [...strip.querySelectorAll('.tab')];
  const r = el.getBoundingClientRect();
  const sr = strip.getBoundingClientRect();
  const from = els.indexOf(el);
  const d = {
    id: tb.id,
    side: tb.side,
    el,
    strip,
    startX: e.clientX,
    moved: false,
    from,
    pos: from,
    w: r.width + 4,
    others: els.map((x) => {
      const b = x.getBoundingClientRect();
      return { el: x, center: b.left + b.width / 2, w: b.width + 4 };
    }),
    center: r.left + r.width / 2,
    min: sr.left - r.left,
    max: sr.right - r.right,
  };
  tabDrag = d;
  const move = (ev) => {
    const raw = ev.clientX - d.startX;
    if (!d.moved && Math.abs(raw) < 5) return;
    if (!d.moved) {
      d.moved = true;
      el.classList.add('dragging');
      strip.classList.add('sorting');
    }
    const dx = Math.min(Math.max(raw, d.min), d.max);
    el.style.transform = `translateX(${dx}px)`;
    // Sa place : après chaque voisin dont il a dépassé le milieu.
    const c = d.center + dx;
    const pos = d.others.filter((o, i) => i !== d.from && o.center < c).length;
    if (pos === d.pos) return;
    d.pos = pos;
    d.others.forEach((o, i) => {
      if (i === d.from) return;
      const s = slotShift(d, i);
      o.el.style.transform = s ? `translateX(${s}px)` : '';
    });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('blur', up);
    if (!d.moved) {
      tabDrag = null;
      return;
    }
    // Le clic qui suit le glissement ne doit pas changer d'onglet.
    window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
    d.dropping = true;
    const lo = Math.min(d.from, d.pos);
    const hi = Math.max(d.from, d.pos);
    const slot = d.others.slice(lo, hi + 1).filter((o, k) => lo + k !== d.from).reduce((sum, o) => sum + o.w, 0);
    el.classList.add('settling');
    el.style.transform = `translateX(${d.pos > d.from ? slot : -slot}px)`;
    setTimeout(() => {
      tabDrag = null;
      if (d.pos !== d.from) {
        const offset = state.tabs.findIndex((x) => x.side === d.side);
        api.moveTab(d.id, offset + (d.pos > d.from ? d.pos + 1 : d.pos));
      }
      renderTabs();
    }, TAB_SLIDE_MS);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('blur', up);
}

function tabEl(tb, shown) {
  return h(
    'div',
    {
      class: `tab${shown ? ' active' : ''}${tb.private ? ' private' : ''}`,
      // Clic molette : ferme l'onglet.
      onmousedown: (e) => { if (e.button === 1) e.preventDefault(); },
      onauxclick: (e) => { if (e.button === 1) api.closeTab(tb.id); },
      onpointerdown: (e) => startTabDrag(e, tb),
    },
    h('button', { type: 'button', class: 'label', title: tb.title, onclick: () => api.tab(tb.id) }, tb.loading ? h('span', { class: 'spin', 'aria-label': t('chargement…') }) : null, `[${tb.n}] `, tb.title),
    tb.audible || tb.muted ? h('button', {
      type: 'button',
      class: `speaker${tb.muted ? ' muted' : ''}`,
      title: tb.muted ? t('Remettre le son de l\'onglet') : t('Couper le son de l\'onglet'),
      onclick: (e) => {
        e.stopPropagation();
        api.tabMute(tb.id);
      },
    }, speaker(tb.muted)) : null,
    h('button', { type: 'button', class: 'close', 'aria-label': t('Fermer l\'onglet {n}', { n: tb.n }), onclick: () => api.closeTab(tb.id) }, '×'),
  );
}

function renderTabs() {
  if (tabDrag && tabDrag.moved) return; // rendu à la fin du glissement
  const split = state.panes.length > 1;
  groups.forEach((g, i) => {
    g.el.classList.toggle('active', split && i === state.activePane);
    if (i > 0 && !split) {
      fill(g.strip, []);
      g.shownId = null;
      return;
    }
    const shownId = state.panes[i].tabId;
    const list = state.tabs.filter((tb) => tb.side === i);
    fill(g.strip, list.map((tb) => tabEl(tb, tb.id === shownId)));
    g.prev.disabled = list.length < 2;
    g.next.disabled = list.length < 2;
    // L'onglet affiché reste visible dans sa barre.
    if (shownId !== g.shownId) {
      g.shownId = shownId;
      const el = $('.tab.active', g.strip);
      if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  });
  // Pas pendant qu'on la modifie.
  if (document.activeElement !== urlInput) urlInput.value = state.status.url;
}

function renderPanes() {
  content.classList.toggle('split', state.panes.length > 1);
  state.panes.forEach((p, i) => {
    const pane = panesEl[i];
    const viewport = $('.viewport', pane);
    pane.classList.toggle('active', i === state.activePane);
    // Navigation privée d'un seul écran (split) : son écran et son terminal passent en violet.
    for (const el of [pane, cols[i].el]) {
      if (p.private && !state.private) el.dataset.private = '1';
      else delete el.dataset.private;
    }
    cols[i].el.classList.toggle('active', i === state.activePane);
    viewport.classList.toggle('has-screen', !!p.screen);
    viewport.classList.toggle('page', !p.screen && p.page);
    // Barre au-dessus des DevTools collées à la page : on peut les détacher ou les fermer à la souris.
    let bar = $('.devbar', viewport);
    if (!bar) {
      bar = h('div', { class: 'devbar' },
        h('span', { class: 'dim' }, 'DevTools'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'detach', title: t('Détacher dans une fenêtre (devtools detach)'), onclick: () => api.devtools('detach') }, '⇱'),
        h('button', { type: 'button', class: 'close', title: t('Fermer les DevTools (F12)'), onclick: () => api.devtools('close') }, '✕'));
      viewport.append(bar);
    }
    bar.hidden = !p.dev;
    fill($('.pane-bar', pane), state.panes.length > 1 ? [
      h('span', { class: 'pane-title' }, t('écran {n} · {title}', { n: i + 1, title: p.title })),
      h('button', { type: 'button', class: 'pane-close', title: t('Fermer l\'écran {n} (split off {n})', { n: i + 1 }), onclick: (ev) => { ev.stopPropagation(); run(`split off ${i + 1}`); } }, '✕'),
    ] : []);
    const screen = $('.screen', pane);
    const key = getLang() + JSON.stringify(p.screen);
    if (screen.dataset.key !== key) {
      screen.dataset.key = key;
      fill(screen, p.screen ? renderScreen(p.screen) : []);
      screen.scrollTop = p.screen && p.screen.kind === 'ai' ? screen.scrollHeight : 0;
      // La réponse finie, le curseur attend la suite de la discussion.
      const reply = $('.ai-reply textarea', screen);
      if (reply && i === state.activePane && !app.classList.contains('term-hidden')) reply.focus();
    }
  });
}

panesEl.forEach((p, i) => p.addEventListener('pointerdown', () => state && state.activePane !== i && api.pane(i)));

// Player du son : lecture/pause, haut-parleur (couper tout), volume du navigateur avec son pourcentage,
// et ▴ pour régler chaque onglet.
let volumeDragging = false;
// Le player tient dans une seule carte : lecture/pause, volume, pourcentage (clic : muet), son de chaque onglet.
function player(a) {
  const pct = Math.round(a.volume * 100);
  const play = h('button', {
    type: 'button',
    class: 'pl-btn',
    title: a.playing ? t('Mettre en pause') : t('Reprendre la lecture'),
    onclick: () => api.mediaToggle(),
  }, playIcon(a.playing));
  const value = h('button', {
    type: 'button',
    class: 'pl-btn volume-pct',
    title: a.muted ? t('Remettre le son') : t('Couper le son'),
    onclick: () => api.muteAll(),
  }, `${pct} %`);
  const slider = h('input', {
    type: 'range',
    class: 'volume',
    min: '0',
    max: '100',
    value: String(pct),
    title: t('Volume du navigateur : {v} %', { v: pct }),
    onpointerdown: () => { volumeDragging = true; },
    oninput: (e) => {
      value.textContent = `${e.target.value} %`;
      e.target.style.setProperty('--fill', `${e.target.value}%`);
      api.volume(Number(e.target.value) / 100);
    },
  });
  slider.style.setProperty('--fill', `${pct}%`);
  const tabsBtn = h('button', {
    type: 'button',
    id: 'audio-chip',
    class: 'pl-btn',
    title: t('Son de chaque onglet'),
    onclick: () => openPanel('audio'),
  }, '▴');
  return h('span', { class: `player${a.muted ? ' muted' : ''}` }, play, h('span', { class: 'pl-sep' }), slider, value, h('span', { class: 'pl-sep' }), tabsBtn);
}

function playIcon(playing) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  for (const d of playing ? ['M5 3.5v9', 'M11 3.5v9'] : ['M5 3.2v9.6L12.6 8z']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', playing ? 'none' : 'currentColor');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', playing ? '2.2' : '1.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

// Le bouton peut être relâché hors du curseur.
window.addEventListener('pointerup', () => {
  if (!volumeDragging) return;
  volumeDragging = false;
  renderStatus();
});

function renderStatus() {
  // Pendant qu'on fait glisser le volume, ne pas recréer la barre (le curseur serait lâché).
  if (volumeDragging) return;
  const s = state.status;
  // Seules les extensions épinglées (★ dans la popup des extensions) ont leur pastille.
  const chips = state.exts.filter((e) => e.pinned).map((e) => h('button', {
    type: 'button',
    class: `chip${e.enabled ? '' : ' off'}`,
    title: `${e.name}${e.enabled ? '' : t(' (désactivée)')}${e.error ? ` : ${e.error}` : ''} · Alt+${e.n}`,
    onclick: (ev) => api.extPopup(e.n, ev.currentTarget.getBoundingClientRect().right),
  }, `${e.n} ${e.alias}${e.enabled ? '' : ' ⏸'}`));
  fill($('#status'), [
    h('button', { type: 'button', id: 'fav-chip', class: 'chip', title: t('Favoris (Ctrl+Maj+B)'), onclick: () => openPanel('fav') }, t('★ favoris')),
    s.mode === 'TTY' ? h('span', {}, 'TTY') : null,
    h('span', { class: 'addr' }, s.host),
    s.fav ? h('span', {}, `★ ${s.fav}`) : null,
    s.split ? h('span', {}, t('split · écran {n}', { n: state.activePane + 1 })) : null,
    s.devtools ? h('span', { class: 'dev' },
      'DevTools ',
      s.devtools === 'docked'
        ? h('button', { type: 'button', class: 'pill', title: t('Détacher dans une fenêtre (devtools detach)'), onclick: () => api.devtools('detach') }, t('⇱ détacher'))
        : h('button', { type: 'button', class: 'pill', title: t('Remettre à côté de la page'), onclick: () => api.devtools('attach') }, t('⇲ rattacher')),
      ' ',
      h('button', { type: 'button', class: 'pill', title: t('Fermer les DevTools (F12)'), onclick: () => api.devtools('close') }, t('✕ fermer'))) : null,
    s.zoom !== 100 ? h('button', { type: 'button', class: 'pill zoom', title: t('Revenir à 100 % (Ctrl+0)'), onclick: () => api.resetZoom() }, t('zoom {zoom} %', { zoom: s.zoom })) : null,
    h('span', { class: 'grow' }),
    state.audio.show ? player(state.audio) : null,
    chips,
    h('button', {
      type: 'button',
      id: 'ext-chip',
      class: 'chip',
      title: t('Extensions (Ctrl+Maj+E)'),
      onclick: () => openPanel('ext'),
    }, puzzleIcon()),
    h('button', {
      type: 'button',
      id: 'dl-chip',
      class: `chip${state.downloads ? ' busy' : ''}`,
      title: t('Téléchargements (Ctrl+Maj+J)'),
      onclick: () => openPanel('dl'),
    }, downloadIcon(), state.downloads ? ` ${state.downloads}` : null),
    // Le bouton du thème est à la place de l'ancienne heure.
    h('button', {
      type: 'button',
      id: 'mode-chip',
      class: 'chip',
      title: state.light ? t('Passer en mode nuit') : t('Passer en mode jour'),
      onclick: () => api.toggleMode(),
    }, modeIcon(state.light))
  ]);
}

// ------------------------------------------------ écrans internes

const click = (cmd) => (e) => {
  e.preventDefault();
  const newTab = e.ctrlKey || e.metaKey || e.button === 1;
  run(newTab && /^\d+$/.test(cmd) ? `${cmd}t` : cmd);
};

function item(cls, cmd, ...children) {
  return h('button', { type: 'button', class: `item ${cls}`, onclick: click(cmd), onauxclick: click(cmd) }, ...children);
}

function head(text, extra) {
  return h('h2', {}, h('span', { class: 'prompt-sign' }, '❯ '), text, extra ? h('span', { class: 'dim' }, ` · ${extra}`) : null);
}

const LOGO = String.raw` _____          _ _   _
|__  /___ _ __ (_) |_| |__
  / // _ \ '_ \| | __| '_ \
 / /|  __/ | | | | |_| | | |
/____\___|_| |_|_|\__|_| |_|`;

const HOME_COMMANDS = [
  ['brows', mark('<recherche>'), mark('lancer une recherche')],
  ['ia', '<question>', mark('réponse courte d\'une IA (« ia » pour la choisir)')],
  ['go', '<url>', mark('ouvrir une adresse')],
  ['fav', '', mark('liste des favoris')],
  ['add', mark('[dossier/]nom'), mark('ajouter la page aux favoris')],
  ['hist', '', mark('historique')],
  ['clean', '[all]', mark('vider l\'historique (+ cookies)')],
  ['split', '[off [1|2]]', mark('deux écrans côte à côte ; off ferme un écran')],
  ['ext', '', 'extensions'],
  ['lang', '[fr | en]', mark('langue de l\'interface (français ou anglais)')],
  ['update', '', mark('mises à jour')],
  ['help', '', mark('toutes les commandes et raccourcis')],
];

function cmdLine([name, args, desc]) {
  return h('div', {}, h('span', { class: 'acc' }, name), ` ${t(args)}`.padEnd(20 - name.length), h('span', { class: 'dim' }, t(desc)));
}

const screens = {
  home(s) {
    return [
      h('pre', { class: 'logo-art', 'aria-label': 'Zenith' }, LOGO),
      h('div', { class: 'dim' }, t('Bonjour {user}. Tape ', { user: s.user }), h('span', { class: 'acc' }, 'help'), t(' pour la liste des commandes, ou directement une recherche ou une adresse.')),
      h(
        'div',
        { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Commandes')), HOME_COMMANDS.map(cmdLine)),
        h(
          'div',
          {},
          h('h3', {}, t('Favoris récents')),
          s.recent.length
            ? s.recent.map((r) => item('', String(r.n), h('span', { class: 'dim' }, `[${r.n}]`), r.path))
            : h('div', { class: 'dim' }, t('Aucun favori. Sur un site, tape « add dossier/nom ».')),
          s.recent.length ? h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir.')) : null,
        ),
      ),
      s.changes ? h('div', { class: 'changes' },
        h('h3', {}, t('Nouveautés de la version {version}', { version: s.changes.version })),
        h('ul', {}, s.changes.notes.map((n) => h('li', {}, n)))) : null,
    ];
  },

  ai(s) {
    // Une discussion : les échanges précédents, la réponse en cours, puis la ligne pour répondre.
    const reply = h('textarea', {
      rows: '1',
      spellcheck: 'false',
      'aria-label': t('Répondre à {name}', { name: s.provider }),
      oninput: (e) => grow(e.target),
      onkeydown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          activeCol().input.focus();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = e.target.value.trim();
          if (text) api.aiReply(text);
        }
      },
    });
    return [
      s.turns.map((x) => [
        head(x.q),
        h('div', { class: 'ai-text' }, x.a),
      ]),
      head(s.turns.length ? s.question : `ia ${s.question}`, s.done ? s.provider : t('{name} réfléchit…', { name: s.provider })),
      s.text ? h('div', { class: 'ai-text' }, s.text, s.done ? null : h('span', { class: 'acc' }, ' ▍')) : (s.done ? null : h('div', { class: 'dim' }, '…')),
      s.error ? h('div', { class: 'err' }, s.error) : null,
      s.done && !s.error ? h('form', { class: 'ai-reply', onsubmit: (e) => e.preventDefault() }, h('span', { class: 'acc' }, '> '), reply) : null,
      s.sources.length ? [
        h('h3', { class: 'sources' }, 'Sources'),
        s.sources.map((r) => item('result', String(r.n), h('span', { class: 'badge' }, r.n), h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short)))),
        h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir une source · '), h('b', {}, '2t'), t(' nouvel onglet · '), h('b', {}, 'brows'), t(' pour une recherche classique')),
      ] : null,
    ];
  },

  aiproviders(s) {
    return [
      head('ia', t('choisir l\'IA qui répond à « ia <question> »')),
      h(
        'table',
        {},
        h('tr', {}, ['#', t('IA'), t('modèle'), t('clé'), ''].map((c) => h('th', {}, c))),
        s.rows.map((r) => h(
          'tr',
          { class: r.current ? 'current' : '' },
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => run(String(r.n)) }, r.name), r.current ? h('span', { class: 'acc' }, t(' ● actuelle')) : null),
          h('td', { class: 'dim' }, r.model),
          h('td', { class: r.ready ? 'ok' : 'dim' }, r.key),
          h('td', {}, r.free ? h('span', { class: 'pill ok' }, t('gratuit')) : h('span', { class: 'pill dim' }, t('payant')), r.web ? h('span', { class: 'pill' }, 'web') : null),
        )),
      ),
      h(
        'div',
        { class: 'hint' },
        t('Tape un numéro pour choisir · '), h('b', {}, 'ia key'), t(' <clé> pour connecter l\'IA actuelle · '),
        h('b', {}, 'ia logout'), t(' retire sa clé · '), h('b', {}, 'ia model'), t(' <id> change de modèle'),
      ),
      h('div', { class: 'hint' }, t('Les clés restent sur cet ordinateur, chiffrées par le système. Gratuit : Gemini, Mistral, Groq et OpenRouter (avec des limites par jour), Ollama (en local).')),
    ];
  },

  results(s) {
    return [
      head(`brows ${s.query}`, t('{engine} · {count} résultats · page {page}', { engine: s.engine, count: s.results.length, page: s.page })),
      s.results.map((r) => item(
        'result',
        String(r.n),
        h('span', { class: 'badge' }, r.n),
        h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short), r.desc ? h('span', { class: 'desc' }, r.desc) : null),
      )),
      h(
        'div',
        { class: 'hint' },
        t('Tape un numéro pour ouvrir · '), h('b', {}, '3t'), t(' nouvel onglet (ou Ctrl+clic)'),
        s.next ? [' · ', h('b', {}, 'n'), t(' page suivante')] : null,
        s.prev ? [' · ', h('b', {}, 'p'), t(' page précédente')] : null,
      ),
    ];
  },

  fav(s) {
    const open = []; // pour chaque profondeur : reste-t-il des frères en dessous ?
    return [
      head(`fav${s.folder ? ` ${s.folder}` : ''}`, t('{links} favoris, {folders} dossiers', { links: s.counts.links, folders: s.counts.folders })),
      h('h3', {}, `~/${t('favoris')}${s.folder ? `/${s.folder}` : ''}`),
      s.rows.length ? h('div', { class: 'tree' }, s.rows.map((r) => {
        open[r.depth] = !r.last;
        const prefix = open.slice(0, r.depth).map((o) => (o ? '│  ' : '   ')).join('') + (r.last ? '└─ ' : '├─ ');
        if (r.type === 'folder') {
          return item('', `fav ${r.path}`, h('span', { class: 'branch' }, prefix), h('span', { class: 'folder' }, `${r.name}/`));
        }
        return h(
          'div',
          { class: 'item' },
          h('span', { class: 'branch' }, prefix),
          h('button', { type: 'button', onclick: click(String(r.n)), onauxclick: click(String(r.n)) }, h('span', { class: 'num' }, `[${r.n}]`), r.name),
          h('span', { class: 'site' }, r.url.replace(/^https?:\/\/(www\.)?/, '')),
          h('button', { type: 'button', class: 'rm', 'aria-label': t('Supprimer {path}', { path: r.path }), title: t('Supprimer'), onclick: () => run(`fav rm ${r.path}`) }, '✕'),
        );
      })) : h('div', { class: 'dim' }, t('Aucun favori ici. Sur un site, tape « add dossier/nom ».')),
      h('div', { class: 'hint' }, h('b', {}, 'fav rm'), t(' chemin|n · '), h('b', {}, 'fav mv'), t(' chemin destination/ · '), h('b', {}, 'fav rename'), t(' chemin nom · '), h('b', {}, 'undo')),
    ];
  },

  hist(s) {
    let day = null;
    const rows = [];
    for (const r of s.rows) {
      const d = dayLabel(r.time);
      if (d !== day) {
        day = d;
        rows.push(h('div', { class: 'day' }, d));
      }
      const time = new Date(r.time).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
      rows.push(item('', String(r.n), h('span', { class: 'time' }, `[${r.n}] ${time}`), r.label, h('span', { class: 'title' }, r.title)));
    }
    return [
      head(`hist${s.filter ? ` ${s.filter}` : ''}`, t('{count} entrées', { count: s.total })),
      h('div', { class: 'rows' }, rows.length ? rows : h('div', { class: 'dim' }, t('Historique vide.'))),
      h('div', { class: 'hint' }, h('b', {}, 'hist'), t(' texte pour filtrer · '), h('b', {}, 'clean'), t(' vide l\'historique · '), h('b', {}, 'clean all'), t(' vide aussi les cookies')),
    ];
  },

  tabs(s) {
    return [
      head('tab', t('{count} onglets', { count: s.rows.length })),
      h('div', { class: 'rows' }, s.rows.map((r) => item('', String(r.n), h('span', { class: 'time' }, `[${r.n}]`), r.title, h('span', { class: 'title' }, r.url), r.pane >= 0 ? h('span', { class: 'acc' }, t('écran {n}', { n: r.pane + 1 })) : null))),
      h('div', { class: 'hint' }, h('b', {}, 'tab new'), ' [url] · ', h('b', {}, 'close'), ' n'),
    ];
  },

  ext(s) {
    return [
      head('ext', t('{count} extensions', { count: s.rows.length })),
      s.rows.length ? h(
        'table',
        {},
        h('tr', {}, ['#', 'alias', t('nom'), t('état'), t('raccourci'), ''].map((c) => h('th', {}, c))),
        s.rows.map((r) => h(
          'tr',
          {},
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', { class: 'acc' }, r.alias),
          h('td', {}, r.name),
          h('td', {}, h('button', { type: 'button', class: `pill ${r.enabled ? 'ok' : 'dim'}`, onclick: () => run(`ext ${r.enabled ? 'off' : 'on'} ${r.n}`) }, r.enabled ? t('actif') : 'pause')),
          h('td', { class: 'dim' }, `Alt+${r.n}`),
          h('td', {}, r.popup ? h('button', { type: 'button', class: 'pill', onclick: () => run(`ext ${r.n}`) }, 'popup') : null, r.error ? h('span', { class: 'err' }, ` ${r.error}`) : null, r.dnrOnly ? h('span', { class: 'warn' }, t(' ne bloque rien ici (ext add ublock)')) : null),
        )),
      ) : h('div', { class: 'dim' }, t('Aucune extension.')),
      h(
        'div',
        { class: 'hint' },
        h('b', {}, 'ext add'), t(' lien du Chrome Web Store, identifiant, dossier ou « ublock » · '),
        h('b', {}, 'ext off|on|rm'), ' n · ', h('b', {}, 'ext alias'), t(' n nom · '), h('b', {}, 'ext n'), t(' ou Alt+n ouvre la popup'),
      ),
    ];
  },

  dl(s) {
    return [
      head('dl', t('{count} téléchargements', { count: s.rows.length })),
      h('div', { class: 'rows' }, s.rows.length ? s.rows.map((r) => item(
        '',
        String(r.n),
        h('span', { class: 'time' }, `[${r.n}]`),
        r.name,
        h('span', { class: r.state === 'completed' ? 'ok' : r.state === 'progressing' ? 'acc' : 'err' }, dlState(r)),
      )) : h('div', { class: 'dim' }, t('Aucun téléchargement.'))),
      h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir le fichier · '), h('b', {}, '3t'), t(' l\'affiche dans son dossier')),
    ];
  },

  help(s) {
    return [
      head('help'),
      h('div', { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Commandes')), s.commands.map(([n, a, d]) => h('div', {}, h('span', { class: 'acc' }, n), ` ${t(a)}`, '\n', h('span', { class: 'dim' }, `    ${t(d)}`)))),
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Raccourcis')), s.shortcuts.map(([k, d]) => h('div', {}, h('span', { class: 'acc' }, t(k)), '\n', h('span', { class: 'dim' }, `    ${t(d)}`))))),
      h('div', { class: 'hint' }, t('Taper autre chose qu\'une commande lance une recherche, ou ouvre l\'adresse si ça en est une.')),
    ];
  },

  tty(s) {
    // Les espaces autour du texte d'un lien restent hors du soulignement.
    const link = (p) => {
      const [, before, text, after] = p.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return [before, h('span', { class: 'tty-link', role: 'link', title: t('ouvrir (Ctrl+clic : nouvel onglet)'), onclick: click(String(p.link)), onauxclick: click(String(p.link)) }, text || '↗', h('span', { class: 'tty-n' }, `[${p.link}]`)), after];
    };
    const parts = (b) => b.parts.flatMap((p) => (p.link ? link(p) : p.text));
    return [
      head(`tty ${s.host}`, s.loading ? t('chargement…') : s.error ? s.error : t('{count} liens', { count: s.links })),
      s.title ? h('h3', {}, s.title) : null,
      h('div', { class: 'tty' }, s.blocks.map((b) => {
        if (b.type === 'pre') return h('pre', {}, b.parts[0].text);
        if (b.type === 'h') return h('div', { class: 'tty-h' }, parts(b));
        if (b.type === 'li') return h('div', { class: 'tty-li' }, '• ', parts(b));
        return h('div', { class: 'tty-p' }, parts(b));
      })),
      h('div', { class: 'hint' }, t('Tape un numéro ou clique un lien · '), h('b', {}, '3t'), t(' nouvel onglet · '), h('b', {}, 'tty off'), t(' revient à la page')),
    ];
  },

  alias(s) {
    return [
      head('alias', `${s.rows.length} alias`),
      s.rows.length ? h('div', { class: 'cmd-list' }, s.rows.map((r) => h('div', {}, h('span', { class: 'acc' }, r.name), ' = ', r.value))) : h('div', { class: 'dim' }, t('Aucun alias.')),
      h('div', { class: 'hint' }, h('b', {}, 'alias yt = brows youtube'), ' · ', h('b', {}, 'unalias yt')),
    ];
  },
};

function renderScreen(s) {
  return (screens[s.kind] || (() => [h('div', {}, s.kind)]))(s);
}

function dayLabel(time) {
  const d = new Date(time);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (diff === 0) return t('aujourd\'hui');
  if (diff === 1) return t('hier');
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function dlState(r) {
  if (r.state === 'completed') return t('terminé');
  if (r.state === 'progressing') return r.total ? `${Math.round((r.received / r.total) * 100)} %` : t('{size} Ko', { size: Math.round(r.received / 1024) });
  return t('interrompu');
}

// Libellés écrits dans index.html : traduits au démarrage et quand la langue change.
function applyStaticLabels() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll('.tab-strip')) el.setAttribute('aria-label', t('Onglets'));
  for (const b of document.querySelectorAll('.new-tab')) {
    b.setAttribute('aria-label', t('Nouvel onglet'));
    b.title = t('Nouvel onglet (Ctrl+T)');
  }
  for (const b of document.querySelectorAll('.tab-prev')) {
    b.setAttribute('aria-label', t('Onglet précédent'));
    b.title = t('Onglet précédent (Ctrl+Maj+Tab)');
  }
  for (const b of document.querySelectorAll('.tab-next')) {
    b.setAttribute('aria-label', t('Onglet suivant'));
    b.title = t('Onglet suivant (Ctrl+Tab)');
  }
  $('#url').title = t('Modifier l\'adresse (Entrée pour y aller)');
  $('#url').placeholder = t('adresse ou recherche');
  $('#url-copy').title = t('Copier l\'adresse');
  $('#url-copy').setAttribute('aria-label', t('Copier l\'adresse'));
  $('#copied').textContent = t('copié');
  $('.pane-resizer').title = t('Glisser pour redimensionner');
  $('#resizer').title = t('Glisser pour redimensionner le terminal (double-clic : taille par défaut)');
  for (const b of document.querySelectorAll('.devbar .detach')) b.title = t('Détacher dans une fenêtre (devtools detach)');
  for (const b of document.querySelectorAll('.devbar .close')) b.title = t('Fermer les DevTools (F12)');
}

applyStaticLabels();
renderPs1();
print([{ t: t('Zenith prêt. Ctrl+H revient ici, Ctrl+L vide le terminal, Ctrl+J le cache, Échap rend la main à la page.'), c: 'dim' }]);
api.ready();
cols[0].input.focus();

// Clic droit dans le terminal, comme dans le Terminal Windows : copie le texte sélectionné,
// sinon colle le presse-papier dans la ligne de commande.
$('#terminal').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const c = cols.find((x) => x.el.contains(e.target)) || activeCol();
  const input = c.input;
  const inInput = document.activeElement === input && input.selectionStart !== input.selectionEnd;
  const selected = inInput ? input.value.slice(input.selectionStart, input.selectionEnd) : String(window.getSelection());
  if (selected) {
    api.writeClipboard(selected);
    window.getSelection().removeAllRanges();
    input.focus();
    return;
  }
  const text = (await api.readClipboard()).replace(/\r?\n/g, ' ').trim();
  input.focus();
  if (text) input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  grow(input);
});
