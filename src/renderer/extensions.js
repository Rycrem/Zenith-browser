'use strict';

// Popup des extensions : ★ épingle une extension dans la barre du bas, un clic sur son nom l'ouvre.
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';

const $ = (sel) => document.querySelector(sel);

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
