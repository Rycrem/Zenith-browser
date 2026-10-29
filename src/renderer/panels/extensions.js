'use strict';

// Popup des extensions : ★ épingle une extension dans la barre du bas, un clic sur son nom l'ouvre.

const act = (action, arg) => window.panel.act(action, arg);

function render(d) {
  const L = d.labels;
  $('#title').textContent = d.title;
  $('#hint').textContent = d.hint;
  $('#rows').replaceChildren(...(d.list.length ? d.list.map((e) => h('div', { class: `arow${e.enabled ? '' : ' off'}` },
    h('button', { type: 'button', class: `star${e.pinned ? ' pinned' : ''}`, title: e.pinned ? L.unpin : L.pin, onclick: () => act('pin', { n: e.n }) }, e.pinned ? '★' : '☆'),
    h('button', { type: 'button', class: 'name link', title: L.open.replace('{n}', e.n), onclick: () => act('open', { n: e.n }) },
      h('span', { class: 'n' }, `${e.n}`), e.name),
    h('button', { type: 'button', class: 'pill', title: e.enabled ? L.off : L.on, onclick: () => act('toggle', { n: e.n }) }, e.enabled ? 'on' : 'off'),
  )) : [h('div', { class: 'empty' }, d.empty)]));
  window.panel.size($('#pop').offsetHeight);
}

window.panel.onData(render);
