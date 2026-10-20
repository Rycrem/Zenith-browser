'use strict';

// Popup des favoris : l'arbre (dossiers repliables) ou, en tapant, les favoris qui correspondent.
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';
if (new URLSearchParams(location.search).get('private')) document.documentElement.dataset.private = '1';

const $ = (sel) => document.querySelector(sel);
const filter = $('#filter');
let data = null;
let active = 0; // favori sélectionné au clavier, parmi ceux affichés
let opened = new Set();
try {
  opened = new Set(JSON.parse(localStorage.getItem('opened') || '[]'));
} catch {}

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

// Même ordre que src/shared/favorites.js : celui choisi à la main, sinon dossiers d'abord puis alphabétique.
const sorted = (folder) => (folder.manual ? folder.children : [...folder.children].sort((a, b) => (a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, 'fr'))));
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const clean = (u) => String(u || '').replace(/#.*$/, '').replace(/\/$/, '');

function open(url, newTab) {
  window.panel.act('open', { url, newTab });
}

function linkRow(l, sub, depth, path) {
  const newTab = (e) => e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
  return draggable(path, false, h('div', {
    class: `fav link${clean(l.url) === clean(data.current) ? ' here' : ''}`,
    title: `${l.url}\n${data.openTitle}`,
    'data-url': l.url,
    onclick: (e) => open(l.url, newTab(e)),
    onauxclick: (e) => e.button === 1 && open(l.url, true),
  }, indent(depth), h('span', { class: 'icon' }, '·'), h('span', { class: 'label' }, l.name), h('span', { class: 'sub' }, sub)));
}

// ------------------------------------------------ glisser-déposer (arbre seulement, pas en filtrant)

let dragPath = null;

function dropWhere(e, row, isFolder) {
  const r = row.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  if (isFolder) return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
  return y < 0.5 ? 'before' : 'after';
}

function clearDrop() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
}

function draggable(path, isFolder, row) {
  if (!path) return row;
  row.draggable = true;
  row.dataset.path = path;
  row.addEventListener('dragstart', (e) => {
    dragPath = path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    dragPath = null;
    row.classList.remove('dragging');
    clearDrop();
  });
  row.addEventListener('dragover', (e) => {
    if (!dragPath || dragPath === path || path.toLowerCase().startsWith(`${dragPath.toLowerCase()}/`)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDrop();
    row.classList.add(`drop-${dropWhere(e, row, isFolder)}`);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-into'));
  row.addEventListener('drop', (e) => {
    if (!dragPath) return;
    e.preventDefault();
    const where = dropWhere(e, row, isFolder);
    const src = dragPath;
    clearDrop();
    if (where === 'into') opened.add(path);
    window.panel.act('move', { src, target: path, where });
  });
  return row;
}

function indent(depth) {
  return depth ? h('span', { class: 'icon' }, '  '.repeat(depth)) : null;
}

function treeRows(folder, prefix, depth, out) {
  for (const c of sorted(folder)) {
    const path = prefix ? `${prefix}/${c.name}` : c.name;
    if (c.type === 'folder') {
      const isOpen = opened.has(path);
      out.push(draggable(path, true, h('div', {
        class: 'fav folder',
        onclick: () => {
          if (isOpen) opened.delete(path);
          else opened.add(path);
          try {
            localStorage.setItem('opened', JSON.stringify([...opened]));
          } catch {}
          render();
        },
      }, indent(depth), h('span', { class: 'icon' }, isOpen ? '▾' : '▸'), h('span', { class: 'label' }, `${c.name}/`), h('span', { class: 'sub' }, String(count(c))))));
      if (isOpen) treeRows(c, path, depth + 1, out);
    } else out.push(linkRow(c, host(c.url), depth, path));
  }
  return out;
}

function count(folder) {
  return folder.children.reduce((n, c) => n + (c.type === 'folder' ? count(c) : 1), 0);
}

function matches(q) {
  const out = [];
  (function walk(folder, prefix) {
    for (const c of folder.children) {
      const path = prefix ? `${prefix}/${c.name}` : c.name;
      if (c.type === 'folder') walk(c, path);
      else if (`${path} ${c.url} ${c.title || ''}`.toLowerCase().includes(q)) out.push({ ...c, path });
    }
  })(data.tree, '');
  return out.map((l) => linkRow(l, l.path.includes('/') ? l.path.slice(0, l.path.lastIndexOf('/')) : host(l.url), 0));
}

function render() {
  const q = filter.value.trim().toLowerCase();
  let rows;
  if (!data.tree.children.length) rows = [h('div', { class: 'empty' }, data.empty)];
  else {
    rows = q ? matches(q) : treeRows(data.tree, '', 0, []);
    if (!rows.length) rows = [h('div', { class: 'empty' }, data.none)];
  }
  $('#tree').replaceChildren(...rows);
  const links = [...document.querySelectorAll('.fav.link')];
  active = Math.min(active, Math.max(0, links.length - 1));
  if (q && links[active]) links[active].classList.add('active');
  window.panel.size($('#pop').offsetHeight);
}

filter.addEventListener('input', () => {
  active = 0;
  render();
});

filter.addEventListener('keydown', (e) => {
  const links = [...document.querySelectorAll('.fav.link')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!links.length) return;
    links.forEach((l) => l.classList.remove('active'));
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[active].classList.add('active');
    links[active].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && links[active]) {
    open(links[active].dataset.url, e.ctrlKey || e.metaKey);
  }
});

window.panel.onData((d) => {
  const first = !data;
  data = d;
  $('#title').textContent = d.title;
  $('#hint').textContent = d.hint;
  filter.placeholder = d.filter;
  // Au premier affichage d'un petit arbre, tout est déplié.
  if (first && !opened.size && count(d.tree) <= 15) {
    (function walk(folder, prefix) {
      for (const c of folder.children) {
        if (c.type !== 'folder') continue;
        const path = prefix ? `${prefix}/${c.name}` : c.name;
        opened.add(path);
        walk(c, path);
      }
    })(d.tree, '');
  }
  render();
  filter.focus();
});
