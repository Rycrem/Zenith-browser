'use strict';

// Popup des téléchargements : le processus principal envoie la liste déjà traduite.
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';
if (new URLSearchParams(location.search).get('private')) document.documentElement.dataset.private = '1';

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

// Roue de progression : un cercle plein pour le fond, un arc pour l'avancement.
const SVG = 'http://www.w3.org/2000/svg';
function ring(r) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('class', `ring ${r.state}`);
  const circle = (cls) => {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', '18');
    c.setAttribute('cy', '18');
    c.setAttribute('r', '15');
    c.setAttribute('class', cls);
    return c;
  };
  svg.append(circle('track'));
  const arc = circle(r.state === 'progressing' && r.pct === null ? 'arc spin' : 'arc');
  const len = 2 * Math.PI * 15;
  const pct = r.state === 'progressing' ? (r.pct === null ? 25 : r.pct) : 100;
  arc.setAttribute('stroke-dasharray', `${(len * pct) / 100} ${len}`);
  svg.append(arc);
  const label = document.createElementNS(SVG, 'text');
  label.setAttribute('x', '18');
  label.setAttribute('y', '18');
  label.textContent = r.state === 'completed' ? '✓' : r.state === 'progressing' ? (r.pct === null ? '↓' : `${r.pct}`) : '✗';
  svg.append(label);
  return svg;
}

window.panel.onData((d) => {
  document.querySelector('#title').textContent = d.title;
  document.querySelector('#hint').textContent = d.hint;
  const dir = document.querySelector('#dir');
  dir.textContent = d.dir;
  dir.onclick = () => window.panel.act('dir');
  document.querySelector('#rows').replaceChildren(...(d.rows.length ? d.rows.map((r) => h('div', {
    class: `row${r.state === 'completed' ? '' : ' off'}`,
    title: r.state === 'completed' ? d.openTitle : null,
    onclick: () => r.state === 'completed' && window.panel.act('open', r.i),
  },
  ring(r),
  h('div', { class: 'name' }, h('span', { class: 'n' }, `[${r.i + 1}]`), r.name),
  r.state === 'interrupted' || r.state === 'cancelled' ? null : h('button', {
    type: 'button',
    class: 'folder',
    title: d.folderTitle,
    onclick: (e) => {
      e.stopPropagation();
      window.panel.act('folder', r.i);
    },
  }, d.folder),
  h('div', { class: `info ${r.state === 'completed' ? 'ok' : r.state === 'progressing' ? 'run' : 'err'}` }, r.label))) : [h('div', { class: 'empty' }, d.empty)]));
  window.panel.size(document.querySelector('#pop').offsetHeight);
});
