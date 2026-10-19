'use strict';

const api = window.brows;
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const content = $('#content');
const input = $('#input');
const scrollback = $('#scrollback');
const panesEl = [...document.querySelectorAll('.pane')];

let state = null;
let awaiting = false; // « (O/n) » ou « (o/N) » quand une question oui/non attend une réponse
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
function fill(el, children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

// ------------------------------------------------ terminal

// Un terminal par onglet ; l'historique des commandes (↑ ↓) reste commun.
const terms = new Map(); // id d'onglet → div du terminal
let termId = null;

function term(id = termId) {
  let el = terms.get(id);
  if (!el) {
    el = h('div', { class: 'term' });
    el.hidden = id !== termId;
    terms.set(id, el);
    scrollback.append(el);
  }
  return el;
}

function showTerm(id, alive) {
  for (const [k, el] of terms) {
    if (k !== null && !alive.has(k)) {
      el.remove();
      terms.delete(k);
    }
  }
  if (id === termId) return;
  // Les messages d'avant le premier état vont au premier onglet.
  if (termId === null && terms.has(null) && !terms.has(id)) {
    terms.set(id, terms.get(null));
    terms.delete(null);
  }
  termId = id;
  for (const [k, el] of terms) el.hidden = k !== id;
  term(id);
  scrollback.scrollTop = scrollback.scrollHeight;
}

function print(lines, el = term()) {
  for (const l of lines) {
    el.append(h('div', { class: l.c || '' }, l.t));
    if (l.c === 'warn' && l.t.trim().startsWith('?')) awaiting = /\(o\/N\)$/.test(l.t) ? '(o/N)' : '(O/n)';
  }
  while (el.childElementCount > 600) el.firstElementChild.remove();
  scrollback.scrollTop = scrollback.scrollHeight;
  renderPs1();
}

// La clé API ne doit apparaître ni à l'écran ni dans l'historique des commandes.
const SECRET = /^(\s*(?:ia|ai)\s+(?:key|connect\s+\S+)\s+)\S+/i;
const masked = (line) => line.replace(SECRET, '$1••••••••');

async function run(line, { echo = true } = {}) {
  const el = term();
  if (echo) print([{ t: `❯ ${masked(line)}`, c: 'cmd' }], el);
  awaiting = false;
  renderPs1();
  const res = await api.exec(line);
  if (res.clear) el.replaceChildren();
  print(res.lines, el.isConnected ? el : term());
  if (res.hideTerminal) setTerminalHidden(true);
  else input.focus();
}

function renderPs1() {
  const ps1 = $('#ps1');
  if (awaiting) {
    ps1.replaceChildren(h('span', { class: 'warn' }, awaiting), ' ', h('span', { class: 'acc' }, '❯'));
    return;
  }
  const host = state ? state.status.host || 'accueil' : '…';
  ps1.replaceChildren(
    h('span', { class: 'user' }, state ? state.user : ''),
    h('span', { class: 'dim' }, '@'),
    h('span', { class: 'host' }, host),
    ' ',
    h('span', { class: 'acc' }, '❯'),
  );
}

$('#new-tab').addEventListener('click', () => api.newTab());

// Un clic sur l'adresse la copie.
$('#url').addEventListener('click', () => {
  const url = $('#url').textContent;
  if (!url) return;
  api.writeClipboard(url);
  print([{ t: `  ✓ adresse copiée : ${url}`, c: 'ok' }]);
});

$('#prompt').addEventListener('submit', (e) => {
  e.preventDefault();
  const line = input.value;
  input.value = '';
  if (line.trim() && !awaiting && !SECRET.test(line) && cmdHistory[cmdHistory.length - 1] !== line) {
    cmdHistory.push(line);
    if (cmdHistory.length > 300) cmdHistory.shift();
    persist('cmdHistory', cmdHistory);
  }
  histIndex = cmdHistory.length;
  run(line);
});

input.addEventListener('keydown', async (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    histIndex = Math.max(0, Math.min(cmdHistory.length, histIndex + (e.key === 'ArrowUp' ? -1 : 1)));
    input.value = cmdHistory[histIndex] || '';
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const res = await api.complete(input.value);
    input.value = res.line;
    if (res.options.length) print([{ t: `  ${res.options.join('   ')}`, c: 'dim' }]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    input.value = '';
    api.focusPage();
  }
});

// Taper n'importe où dans l'interface renvoie au terminal.
document.addEventListener('keydown', (e) => {
  if (e.target === input || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  input.focus();
});

function setTerminalHidden(hidden) {
  app.classList.toggle('term-hidden', hidden);
  persist('termHidden', hidden);
  if (hidden) api.focusPage();
  else input.focus();
  requestAnimationFrame(sendRects);
}

api.on('term:print', print);
api.on('term:toggle', () => setTerminalHidden(!app.classList.contains('term-hidden')));
api.on('term:focus', (prefill) => {
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  if (prefill) input.value = prefill;
  input.focus();
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
}, () => persist('paneRatio', ratio));

function sendRects() {
  const split = state && state.panes.length > 1;
  api.layout(panesEl.map((p, i) => {
    if (i > 0 && !split) return null;
    const r = $('.viewport', p).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
}

new ResizeObserver(sendRects).observe(content);
window.addEventListener('resize', sendRects);

// ------------------------------------------------ rendu de l'état

api.on('state', (s) => {
  state = s;
  document.documentElement.style.setProperty('--accent', s.accent);
  showTerm(s.panes[s.activePane].tabId, new Set(s.tabs.map((t) => t.id)));
  renderTabs();
  renderPanes();
  renderStatus();
  renderPs1();
  requestAnimationFrame(sendRects);
});

function renderTabs() {
  const activeId = state.panes[state.activePane].tabId;
  fill($('#tabs'), state.tabs.map((t) => h(
    'div',
    {
      class: `tab${t.id === activeId ? ' active' : ''}${t.pane >= 0 && t.id !== activeId ? ' other-pane' : ''}`,
      draggable: 'true',
      // Clic molette : ferme l'onglet.
      onmousedown: (e) => { if (e.button === 1) e.preventDefault(); },
      onauxclick: (e) => { if (e.button === 1) api.closeTab(t.id); },
      // Glisser-déposer pour changer l'ordre des onglets.
      ondragstart: (e) => { e.dataTransfer.setData('text/x-tab', String(t.id)); e.dataTransfer.effectAllowed = 'move'; },
      ondragover: (e) => { if (e.dataTransfer.types.includes('text/x-tab')) { e.preventDefault(); e.currentTarget.classList.add('drop'); } },
      ondragleave: (e) => e.currentTarget.classList.remove('drop'),
      ondrop: (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drop');
        const id = Number(e.dataTransfer.getData('text/x-tab'));
        if (id && id !== t.id) api.moveTab(id, t.id);
      },
    },
    h('button', { type: 'button', class: 'label', title: t.title, onclick: () => api.tab(t.id) }, `[${t.n}] `, t.loading ? h('span', { class: 'spin' }, '◌ ') : null, t.title),
    h('button', { type: 'button', class: 'close', 'aria-label': `Fermer l'onglet ${t.n}`, onclick: () => api.closeTab(t.id) }, '×'),
  )));
  $('#url').textContent = state.status.url;
}

function renderPanes() {
  content.classList.toggle('split', state.panes.length > 1);
  state.panes.forEach((p, i) => {
    const pane = panesEl[i];
    const viewport = $('.viewport', pane);
    pane.classList.toggle('active', i === state.activePane);
    viewport.classList.toggle('has-screen', !!p.screen);
    viewport.classList.toggle('page', !p.screen && p.page);
    // Barre au-dessus des DevTools collées à la page : on peut les détacher ou les fermer à la souris.
    let bar = $('.devbar', viewport);
    if (!bar) {
      bar = h('div', { class: 'devbar' },
        h('span', { class: 'dim' }, 'DevTools'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', title: 'Détacher dans une fenêtre (devtools detach)', onclick: () => api.devtools('detach') }, '⇱'),
        h('button', { type: 'button', title: 'Fermer les DevTools (F12)', onclick: () => api.devtools('close') }, '✕'));
      viewport.append(bar);
    }
    bar.hidden = !p.dev;
    fill($('.pane-bar', pane), state.panes.length > 1 ? [
      h('span', { class: 'pane-title' }, `écran ${i + 1} · ${p.title}`),
      h('button', { type: 'button', class: 'pane-close', title: `Fermer l'écran ${i + 1} (split off ${i + 1})`, onclick: (ev) => { ev.stopPropagation(); run(`split off ${i + 1}`); } }, '✕'),
    ] : []);
    const screen = $('.screen', pane);
    const key = JSON.stringify(p.screen);
    if (screen.dataset.key !== key) {
      screen.dataset.key = key;
      fill(screen, p.screen ? renderScreen(p.screen) : []);
      screen.scrollTop = 0;
    }
  });
}

panesEl.forEach((p, i) => p.addEventListener('pointerdown', () => state && state.activePane !== i && api.pane(i)));

function renderStatus() {
  const s = state.status;
  const chips = state.exts.map((e) => h('button', {
    type: 'button',
    class: `chip${e.enabled ? '' : ' off'}`,
    title: `${e.name}${e.enabled ? '' : ' (désactivée)'}${e.error ? ` : ${e.error}` : ''} · Alt+${e.n}`,
    onclick: (ev) => api.extPopup(e.n, ev.currentTarget.getBoundingClientRect().right),
  }, `${e.n} ${e.alias}${e.enabled ? '' : ' ⏸'}`));
  fill($('#status'), [
    h('span', {}, s.mode),
    h('span', { class: 'addr' }, s.host),
    s.fav ? h('span', {}, `★ ${s.fav}`) : null,
    s.split ? h('span', {}, `split · écran ${state.activePane + 1}`) : null,
    s.devtools ? h('span', { class: 'dev' },
      'DevTools ',
      s.devtools === 'docked'
        ? h('button', { type: 'button', class: 'pill', title: 'Détacher dans une fenêtre (devtools detach)', onclick: () => api.devtools('detach') }, '⇱ détacher')
        : h('button', { type: 'button', class: 'pill', title: 'Remettre à côté de la page', onclick: () => api.devtools('attach') }, '⇲ rattacher'),
      ' ',
      h('button', { type: 'button', class: 'pill', title: 'Fermer les DevTools (F12)', onclick: () => api.devtools('close') }, '✕ fermer')) : null,
    s.zoom !== 100 ? h('button', { type: 'button', class: 'pill zoom', title: 'Revenir à 100 % (Ctrl+0)', onclick: () => api.resetZoom() }, `zoom ${s.zoom} %`) : null,
    h('span', { class: 'grow' }),
    state.downloads ? h('span', {}, `↓ ${state.downloads}`) : null,
    chips,
    h('span', { id: 'clock' }, clock()),
  ]);
}

function clock() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

setInterval(() => {
  const c = $('#clock');
  if (c) c.textContent = clock();
}, 15000);

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

const LOGO = String.raw`     _                 _
  __| | _____   __    | |__  _ __ _____      _____
 / _' |/ _ \ \ / /____| '_ \| '__/ _ \ \ /\ / / __|
| (_| |  __/\ V /_____| |_) | | | (_) \ V  V /\__ \
 \__,_|\___| \_/      |_.__/|_|  \___/ \_/\_/ |___/`;

const HOME_COMMANDS = [
  ['brows', '<recherche>', 'lancer une recherche'],
  ['ia', '<question>', 'réponse courte d\'une IA (« ia » pour la choisir)'],
  ['go', '<url>', 'ouvrir une adresse'],
  ['fav', '', 'liste des favoris'],
  ['add', '[dossier/]nom', 'ajouter la page aux favoris'],
  ['hist', '', 'historique'],
  ['clean', '[all]', 'vider l\'historique (+ cookies)'],
  ['split', '[off [1|2]]', 'deux écrans côte à côte ; off ferme un écran'],
  ['ext', '', 'extensions'],
  ['update', '', 'mises à jour'],
  ['help', '', 'toutes les commandes et raccourcis'],
];

function cmdLine([name, args, desc]) {
  return h('div', {}, h('span', { class: 'acc' }, name), ` ${args}`.padEnd(20 - name.length), h('span', { class: 'dim' }, desc));
}

const screens = {
  home(s) {
    return [
      h('pre', { class: 'logo-art', 'aria-label': 'dev-brows' }, LOGO),
      h('div', { class: 'dim' }, `Bonjour ${s.user}. Tape `, h('span', { class: 'acc' }, 'help'), ' pour la liste des commandes, ou directement une recherche ou une adresse.'),
      h(
        'div',
        { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, 'Commandes'), HOME_COMMANDS.map(cmdLine)),
        h(
          'div',
          {},
          h('h3', {}, 'Favoris récents'),
          s.recent.length
            ? s.recent.map((r) => item('', String(r.n), h('span', { class: 'dim' }, `[${r.n}]`), r.path))
            : h('div', { class: 'dim' }, 'Aucun favori. Sur un site, tape « add dossier/nom ».'),
          s.recent.length ? h('div', { class: 'hint' }, 'Tape un numéro pour ouvrir.') : null,
        ),
      ),
    ];
  },

  ai(s) {
    return [
      head(`ia ${s.question}`, s.done ? s.provider : `${s.provider} réfléchit…`),
      s.text ? h('div', { class: 'ai-text' }, s.text, s.done ? null : h('span', { class: 'acc' }, ' ▍')) : (s.done ? null : h('div', { class: 'dim' }, '…')),
      s.error ? h('div', { class: 'err' }, s.error) : null,
      s.sources.length ? [
        h('h3', { class: 'sources' }, 'Sources'),
        s.sources.map((r) => item('result', String(r.n), h('span', { class: 'badge' }, r.n), h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short)))),
        h('div', { class: 'hint' }, 'Tape un numéro pour ouvrir une source · ', h('b', {}, '2t'), ' nouvel onglet · ', h('b', {}, 'brows'), ' pour une recherche classique'),
      ] : null,
    ];
  },

  aiproviders(s) {
    return [
      head('ia', 'choisir l\'IA qui répond à « ia <question> »'),
      h(
        'table',
        {},
        h('tr', {}, ['#', 'IA', 'modèle', 'clé', ''].map((t) => h('th', {}, t))),
        s.rows.map((r) => h(
          'tr',
          { class: r.current ? 'current' : '' },
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => run(String(r.n)) }, r.name), r.current ? h('span', { class: 'acc' }, ' ● actuelle') : null),
          h('td', { class: 'dim' }, r.model),
          h('td', { class: r.ready ? 'ok' : 'dim' }, r.key),
          h('td', {}, r.free ? h('span', { class: 'pill ok' }, 'gratuit') : h('span', { class: 'pill dim' }, 'payant'), r.web ? h('span', { class: 'pill' }, 'web') : null),
        )),
      ),
      h(
        'div',
        { class: 'hint' },
        'Tape un numéro pour choisir · ', h('b', {}, 'ia key'), ' <clé> pour connecter l\'IA actuelle · ',
        h('b', {}, 'ia logout'), ' retire sa clé · ', h('b', {}, 'ia model'), ' <id> change de modèle',
      ),
      h('div', { class: 'hint' }, 'Les clés restent sur cet ordinateur, chiffrées par le système. Gratuit : Gemini, Mistral, Groq et OpenRouter (avec des limites par jour), Ollama (en local).'),
    ];
  },

  results(s) {
    return [
      head(`brows ${s.query}`, `${s.engine} · ${s.results.length} résultats · page ${s.page}`),
      s.results.map((r) => item(
        'result',
        String(r.n),
        h('span', { class: 'badge' }, r.n),
        h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short), r.desc ? h('span', { class: 'desc' }, r.desc) : null),
      )),
      h(
        'div',
        { class: 'hint' },
        'Tape un numéro pour ouvrir · ', h('b', {}, '3t'), ' nouvel onglet (ou Ctrl+clic)',
        s.next ? [' · ', h('b', {}, 'n'), ' page suivante'] : null,
        s.prev ? [' · ', h('b', {}, 'p'), ' page précédente'] : null,
      ),
    ];
  },

  fav(s) {
    const open = []; // pour chaque profondeur : reste-t-il des frères en dessous ?
    return [
      head(`fav${s.folder ? ` ${s.folder}` : ''}`, `${s.counts.links} favoris, ${s.counts.folders} dossiers`),
      h('h3', {}, `~/favoris${s.folder ? `/${s.folder}` : ''}`),
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
          h('button', { type: 'button', class: 'rm', 'aria-label': `Supprimer ${r.path}`, title: 'Supprimer', onclick: () => run(`fav rm ${r.path}`) }, '✕'),
        );
      })) : h('div', { class: 'dim' }, 'Aucun favori ici. Sur un site, tape « add dossier/nom ».'),
      h('div', { class: 'hint' }, h('b', {}, 'fav rm'), ' chemin|n · ', h('b', {}, 'fav mv'), ' chemin destination/ · ', h('b', {}, 'fav rename'), ' chemin nom · ', h('b', {}, 'undo')),
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
      const time = new Date(r.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      rows.push(item('', String(r.n), h('span', { class: 'time' }, `[${r.n}] ${time}`), r.label, h('span', { class: 'title' }, r.title)));
    }
    return [
      head(`hist${s.filter ? ` ${s.filter}` : ''}`, `${s.total} entrées`),
      h('div', { class: 'rows' }, rows.length ? rows : h('div', { class: 'dim' }, 'Historique vide.')),
      h('div', { class: 'hint' }, h('b', {}, 'hist'), ' texte pour filtrer · ', h('b', {}, 'clean'), ' vide l\'historique · ', h('b', {}, 'clean all'), ' vide aussi les cookies'),
    ];
  },

  tabs(s) {
    return [
      head('tab', `${s.rows.length} onglets`),
      h('div', { class: 'rows' }, s.rows.map((r) => item('', String(r.n), h('span', { class: 'time' }, `[${r.n}]`), r.title, h('span', { class: 'title' }, r.url), r.pane >= 0 ? h('span', { class: 'acc' }, `écran ${r.pane + 1}`) : null))),
      h('div', { class: 'hint' }, h('b', {}, 'tab new'), ' [url] · ', h('b', {}, 'close'), ' n'),
    ];
  },

  ext(s) {
    return [
      head('ext', `${s.rows.length} extensions`),
      s.rows.length ? h(
        'table',
        {},
        h('tr', {}, ['#', 'alias', 'nom', 'état', 'raccourci', ''].map((t) => h('th', {}, t))),
        s.rows.map((r) => h(
          'tr',
          {},
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', { class: 'acc' }, r.alias),
          h('td', {}, r.name),
          h('td', {}, h('button', { type: 'button', class: `pill ${r.enabled ? 'ok' : 'dim'}`, onclick: () => run(`ext ${r.enabled ? 'off' : 'on'} ${r.n}`) }, r.enabled ? 'actif' : 'pause')),
          h('td', { class: 'dim' }, `Alt+${r.n}`),
          h('td', {}, r.popup ? h('button', { type: 'button', class: 'pill', onclick: () => run(`ext ${r.n}`) }, 'popup') : null, r.error ? h('span', { class: 'err' }, ` ${r.error}`) : null, r.dnrOnly ? h('span', { class: 'warn' }, ' ne bloque rien ici (le bloqueur intégré « adblock » s\'en charge)') : null, r.ublock ? h('span', { class: 'warn' }, ' ne fonctionne pas dans Electron, à supprimer (le bloqueur intégré « adblock » la remplace)') : null),
        )),
      ) : h('div', { class: 'dim' }, 'Aucune extension.'),
      h(
        'div',
        { class: 'hint' },
        h('b', {}, 'ext add'), ' lien du Chrome Web Store, identifiant ou dossier · ',
        h('b', {}, 'ext off|on|rm'), ' n · ', h('b', {}, 'ext alias'), ' n nom · ', h('b', {}, 'ext n'), ' ou Alt+n ouvre la popup',
      ),
    ];
  },

  dl(s) {
    return [
      head('dl', `${s.rows.length} téléchargements`),
      h('div', { class: 'rows' }, s.rows.length ? s.rows.map((r) => item(
        '',
        String(r.n),
        h('span', { class: 'time' }, `[${r.n}]`),
        r.name,
        h('span', { class: r.state === 'completed' ? 'ok' : r.state === 'progressing' ? 'acc' : 'err' }, dlState(r)),
      )) : h('div', { class: 'dim' }, 'Aucun téléchargement.')),
      h('div', { class: 'hint' }, 'Tape un numéro pour ouvrir le fichier · ', h('b', {}, '3t'), ' l\'affiche dans son dossier'),
    ];
  },

  help(s) {
    return [
      head('help'),
      h('div', { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, 'Commandes'), s.commands.map(([n, a, d]) => h('div', {}, h('span', { class: 'acc' }, n), ` ${a}`, '\n', h('span', { class: 'dim' }, `    ${d}`)))),
        h('div', { class: 'cmd-list' }, h('h3', {}, 'Raccourcis'), s.shortcuts.map(([k, d]) => h('div', {}, h('span', { class: 'acc' }, k), '\n', h('span', { class: 'dim' }, `    ${d}`))))),
      h('div', { class: 'hint' }, 'Taper autre chose qu\'une commande lance une recherche, ou ouvre l\'adresse si ça en est une.'),
    ];
  },

  alias(s) {
    return [
      head('alias', `${s.rows.length} alias`),
      s.rows.length ? h('div', { class: 'cmd-list' }, s.rows.map((r) => h('div', {}, h('span', { class: 'acc' }, r.name), ' = ', r.value))) : h('div', { class: 'dim' }, 'Aucun alias.'),
      h('div', { class: 'hint' }, h('b', {}, 'alias yt = brows youtube'), ' · ', h('b', {}, 'unalias yt')),
    ];
  },
};

function renderScreen(s) {
  return (screens[s.kind] || (() => [h('div', {}, s.kind)]))(s);
}

function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (diff === 0) return 'aujourd\'hui';
  if (diff === 1) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dlState(r) {
  if (r.state === 'completed') return 'terminé';
  if (r.state === 'progressing') return r.total ? `${Math.round((r.received / r.total) * 100)} %` : `${Math.round(r.received / 1024)} Ko`;
  return 'interrompu';
}

renderPs1();
print([{ t: 'dev-brows prêt. Ctrl+L revient ici, Ctrl+J cache le terminal, Échap rend la main à la page.', c: 'dim' }]);
api.ready();
input.focus();

// Clic droit dans le terminal, comme dans le Terminal Windows : copie le texte sélectionné,
// sinon colle le presse-papier dans la ligne de commande.
$('#terminal').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
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
});
