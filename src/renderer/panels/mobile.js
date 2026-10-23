'use strict';

// Popup du mode mobile (Ctrl+Alt+M) : un téléphone de la liste, ou une résolution à la main,
// qu'on peut enregistrer ; « ordinateur » revient à l'affichage normal.
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';
if (new URLSearchParams(location.search).get('private')) document.documentElement.dataset.private = '1';

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
const custom = (save) => act('custom', { width: $('#w').value, height: $('#h').value, name: $('#name').value, save });

$('#custom').addEventListener('submit', (e) => {
  e.preventDefault();
  custom(false);
});
$('#save').addEventListener('click', () => $('#custom').reportValidity() && custom(true));

function render(d) {
  $('#title').textContent = d.title;
  $('#hint').textContent = d.hint;
  $('#custom-title').textContent = d.custom;
  $('#w').placeholder = d.width;
  $('#h').placeholder = d.height;
  $('#name').placeholder = d.name;
  $('#apply').textContent = d.apply;
  $('#save').textContent = d.save;
  const row = (active, label, size, onclick, extra) => h('div', { class: `arow${active ? ' current' : ''}` },
    h('span', { class: 'mark' }, active ? '●' : ''),
    h('button', { type: 'button', class: 'name link', onclick }, label, size ? h('span', { class: 'size' }, ` ${size}`) : null),
    extra);
  $('#rows').replaceChildren(
    row(!d.on, d.desktop, '', () => act('off')),
    ...d.devices.map((dv) => row(dv.active, dv.name, dv.size, () => act('set', { i: dv.i }),
      dv.custom ? h('button', { type: 'button', class: 'del', title: d.removeTitle, onclick: () => act('remove', { name: dv.name }) }, '✕') : null)),
  );
  window.panel.size($('#pop').offsetHeight);
}

window.panel.onData(render);
