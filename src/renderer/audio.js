'use strict';

// Popup du son : volume du navigateur, puis chaque onglet (lecture/pause, muet, volume).
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';

const $ = (sel) => document.querySelector(sel);
let dragging = false;
let pending = null;

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
const pct = (v) => `${Math.round(v * 100)} %`;
const step = (v, d) => Math.min(1, Math.max(0, Math.round((v + d) * 10) / 10));

function volumeControls(value, set, labels) {
  const out = h('span', { class: 'pct' }, pct(value));
  return [
    h('button', { type: 'button', title: labels.down, onclick: () => set(step(value, -0.1)) }, '−'),
    h('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(value * 100)),
      onpointerdown: () => { dragging = true; },
      oninput: (e) => {
        out.textContent = pct(e.target.value / 100);
        set(e.target.value / 100);
      },
    }),
    h('button', { type: 'button', title: labels.up, onclick: () => set(step(value, 0.1)) }, '+'),
    out,
  ];
}

// Pendant un glissement, les mises à jour attendent le relâchement (sinon le curseur est recréé).
window.addEventListener('pointerup', () => {
  dragging = false;
  if (pending) render(pending);
});

function render(d) {
  if (dragging) {
    pending = d;
    return;
  }
  pending = null;
  const L = d.labels;
  $('#title').textContent = d.title;
  $('#hint').textContent = d.hint;
  $('#all').replaceChildren(
    h('span', { class: 'name' }, d.all),
    h('button', { type: 'button', class: d.muted ? 'on' : '', title: d.muted ? L.unmute : L.mute, onclick: () => act('muteAll') }, d.muted ? '🔇' : '🔈'),
    ...volumeControls(d.volume, (v) => act('global', { volume: v }), L),
  );
  $('#rows').replaceChildren(...(d.tabs.length ? d.tabs.map((tb) => h('div', { class: 'arow' },
    h('button', { type: 'button', class: 'name link', title: tb.title, onclick: () => act('show', { id: tb.id }) },
      h('span', { class: 'n' }, `[${tb.n}]`), tb.title || tb.host),
    h('button', { type: 'button', title: tb.playing ? L.pause : L.play, onclick: () => act('toggle', { id: tb.id }) }, tb.playing ? '❚❚' : '▶'),
    h('button', { type: 'button', class: tb.muted ? 'on' : '', title: tb.muted ? L.unmute : L.mute, onclick: () => act('mute', { id: tb.id }) }, tb.muted ? '🔇' : '🔈'),
    ...volumeControls(tb.volume, (v) => act('volume', { id: tb.id, volume: v }), L),
  )) : [h('div', { class: 'empty' }, d.empty)]));
  window.panel.size($('#pop').offsetHeight);
}

window.panel.onData(render);
