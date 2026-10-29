'use strict';

// Discussion avec Nadir : la conversation vit dans le processus principal, la popup l'affiche.

const act = (action, arg) => window.panel.act(action, arg);

let last = null;
let shownLevels = null;
let shownChats = null;
let view = 'chat'; // ou 'list' : les discussions enregistrées
let editing = null; // discussion en cours de renommage

function showView(v) {
  view = v;
  editing = null;
  shownChats = null;
  if (last) render(last);
  if (v === 'chat') $('#input').focus();
}

function when(ms, lang) {
  return new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renameRow(row, c, L) {
  editing = c.id;
  const input = h('input', { type: 'text', value: c.title, maxlength: '80', 'aria-label': L.rename });
  const done = (save) => {
    if (editing !== c.id) return;
    if (save) act('rename', { id: c.id, title: input.value });
    editing = null;
    shownChats = null;
    render(last);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    else if (e.key === 'Escape') done(false);
  });
  input.addEventListener('blur', () => done(true));
  row.replaceChildren(input);
  input.focus();
  input.select();
}

// La liste ne se refait que quand elle change (pas à chaque bout de réponse), ni pendant un renommage.
function renderChats(d) {
  const L = d.labels;
  const key = JSON.stringify([d.chats, d.busy]);
  if (editing || key === shownChats) return;
  shownChats = key;
  const rows = d.chats.map((c) => {
    const row = h('div', { class: `chat-row${c.current ? ' current' : ''}` });
    const remove = h('button', { type: 'button', class: 'danger', title: L.remove, disabled: d.busy }, '✕');
    remove.addEventListener('click', () => {
      if (remove.dataset.sure) return act('delete', { id: c.id });
      remove.dataset.sure = '1';
      remove.textContent = L.confirmRemove;
    });
    row.append(
      h('button', { type: 'button', class: 'open', disabled: d.busy, onclick: () => { act('open', { id: c.id }); showView('chat'); } },
        h('span', { class: 'name' }, `${c.pinned ? '★ ' : ''}${c.title}`), h('span', { class: 'when' }, when(c.updated, L.lang))),
      h('button', { type: 'button', title: c.pinned ? L.unpin : L.pin, onclick: () => act('pin', { id: c.id }) }, c.pinned ? '★' : '☆'),
      h('button', { type: 'button', title: L.rename, onclick: () => renameRow(row, c, L) }, '✎'),
      remove);
    return row;
  });
  $('#chats').replaceChildren(...(rows.length ? rows : [h('div', { class: 'dim empty' }, L.noChats)]));
}

function render(d) {
  last = d;
  const L = d.labels;
  $('#title').textContent = d.title;
  $('#hint').textContent = L.hint;
  $('#memory').textContent = d.running ? L.running : '';
  $('#reset').title = L.reset;
  $('#list').title = view === 'list' ? L.back : L.chats;
  $('#list').classList.toggle('on', view === 'list');
  $('#chat').hidden = view === 'list';
  $('#chats').hidden = view !== 'list';
  $('#ask').hidden = view === 'list';
  if (view === 'list') renderChats(d);
  $('#close').title = L.close;
  $('#stop').title = L.stop;
  $('#input').placeholder = L.placeholder;
  $('#level').title = L.level;
  $('#level').disabled = d.busy;
  const levels = JSON.stringify(d.levels);
  if (levels !== shownLevels) {
    shownLevels = levels;
    $('#level').replaceChildren(...d.levels.map((l) => h('option', { value: l.id, selected: l.current, title: l.about }, `${l.name} · ${l.size}${l.downloaded ? ' ✓' : ''}`)));
  }

  // La réponse arrive par petits bouts : on ne touche qu'aux messages qui ont changé. Refaire toute
  // la discussion à chaque bout faisait aussi tout recalculer à l'accessibilité de Windows (lecteurs
  // d'écran, outils qui lisent les fenêtres), jusqu'à saturer la mémoire de Zenith.
  const chat = $('#chat');
  const stick = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  const msgs = d.messages.length ? d.messages : [{ role: 'nadir', text: L.hello }];
  const ask = chat.querySelector('.msg.ask');
  if (ask) ask.remove();
  msgs.forEach((m, i) => {
    const cls = `msg ${m.role}`;
    const el = chat.children[i];
    if (!el) chat.append(h('div', { class: cls }, m.text));
    else {
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== m.text) el.textContent = m.text;
    }
  });
  while (chat.children.length > msgs.length) chat.lastElementChild.remove();
  if (d.pending) {
    const dl = d.pending.kind === 'download';
    chat.append(h('div', { class: 'msg ask' },
      h('div', {}, d.pending.question),
      h('div', { class: 'choices' },
        h('button', { type: 'button', class: 'primary', onclick: () => act('answer', { yes: true }) }, dl ? L.download : L.yes),
        h('button', { type: 'button', onclick: () => act('answer', { yes: false }) }, dl ? L.cancel : L.no))));
  }
  if (stick || d.pending) chat.scrollTop = chat.scrollHeight;

  $('#status').hidden = !d.status;
  $('#status-text').textContent = d.status;
  $('#bar').parentElement.hidden = d.progress === null;
  $('#bar').style.width = `${Math.round((d.progress || 0) * 100)}%`;
  $('#ask').classList.toggle('busy', d.busy);
  window.panel.size(520);
}

$('#ask').addEventListener('submit', (e) => e.preventDefault());
$('#input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text || (last && last.busy)) return;
  act('send', { text });
  $('#input').value = '';
});
$('#level').addEventListener('change', (e) => act('level', { id: e.target.value }));
$('#reset').addEventListener('click', () => {
  act('reset');
  showView('chat');
});
$('#list').addEventListener('click', () => showView(view === 'list' ? 'chat' : 'list'));
$('#close').addEventListener('click', () => act('close'));
$('#stop').addEventListener('click', () => act('stop'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (view === 'list') showView('chat');
  else act('close');
});
window.addEventListener('focus', () => $('#input').focus());

window.panel.onData(render);
