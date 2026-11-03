'use strict';

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
  const col = cols.find((c) => c.input === ta);
  if (col) showGhost(col, '');
}

// Prédiction en gris : d'abord l'historique des commandes (la plus récente), sinon alias,
// favoris et pages visitées (processus principal). → l'accepte.
function showGhost(col, full) {
  const typed = col.input.value;
  col.prediction = full && full.length > typed.length && full.toLowerCase().startsWith(typed.toLowerCase()) ? full : '';
  col.ghost.replaceChildren(...(col.prediction ? [h('span', { class: 'typed' }, typed), col.prediction.slice(typed.length)] : []));
}

async function predict(col) {
  const typed = col.input.value;
  if (!typed.trim() || awaiting || col.input.selectionStart !== typed.length) return showGhost(col, '');
  const low = typed.toLowerCase();
  let full = '';
  for (let i = cmdHistory.length - 1; i >= 0 && !full; i--) if (cmdHistory[i].length > typed.length && cmdHistory[i].toLowerCase().startsWith(low)) full = cmdHistory[i];
  if (!full) full = await api.predict(typed);
  if (col.input.value === typed) showGhost(col, full);
}

async function run(line, { echo = true, newTab = false } = {}) {
  const pane = state ? state.activePane : 0;
  // Ctrl+Entrée : la commande et sa réponse vont dans le terminal du nouvel onglet.
  const el = newTab ? null : term();
  const echoLine = { t: `❯ ${masked(line)}`, c: 'cmd' };
  if (echo && el) print([echoLine], el);
  awaiting = false;
  renderPs1();
  const res = await api.exec(line, { newTab, pane });
  const out = el && el.isConnected ? el : term();
  if (res.clear) out.replaceChildren();
  print(echo && !el ? [echoLine, ...res.lines] : res.lines, out);
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
