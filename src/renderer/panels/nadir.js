'use strict';

// Discussion avec Nadir : la conversation vit dans le processus principal, la popup l'affiche.

const act = (action, arg) => window.panel.act(action, arg);

let last = null;

function render(d) {
  last = d;
  const L = d.labels;
  $('#title').textContent = d.title;
  $('#hint').textContent = L.hint;
  $('#memory').textContent = d.running ? L.running : '';
  $('#reset').title = L.reset;
  $('#close').title = L.close;
  $('#stop').title = L.stop;
  $('#input').placeholder = L.placeholder;
  $('#level').title = L.level;
  $('#level').disabled = d.busy;
  $('#level').replaceChildren(...d.levels.map((l) => h('option', { value: l.id, selected: l.current, title: l.about }, `${l.name} · ${l.size}${l.downloaded ? ' ✓' : ''}`)));

  const chat = $('#chat');
  const stick = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  const msgs = d.messages.length ? d.messages : [{ role: 'nadir', text: L.hello }];
  chat.replaceChildren(...msgs.map((m) => h('div', { class: `msg ${m.role}` }, m.text)));
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
$('#reset').addEventListener('click', () => act('reset'));
$('#close').addEventListener('click', () => act('close'));
$('#stop').addEventListener('click', () => act('stop'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') act('close');
});
window.addEventListener('focus', () => $('#input').focus());

window.panel.onData(render);
