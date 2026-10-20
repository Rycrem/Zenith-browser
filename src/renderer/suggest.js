'use strict';

// Suggestions sous l'adresse, tirées de l'historique. La fenêtre ne prend jamais le focus :
// le clavier reste dans le champ d'adresse, qui choisit la ligne surlignée.
const accent = new URLSearchParams(location.search).get('accent');
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
if (new URLSearchParams(location.search).get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';
if (new URLSearchParams(location.search).get('private')) document.documentElement.dataset.private = '1';

const pop = document.querySelector('#pop');

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const bare = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

window.panel.onData(({ list, selected }) => {
  pop.replaceChildren(...list.map((s, i) => h('div', {
    class: `sug${i === selected ? ' active' : ''}`,
    title: s.url,
    onmousedown: (e) => e.preventDefault(),
    onclick: (e) => window.panel.act('open', { url: s.url, newTab: e.ctrlKey || e.metaKey || e.shiftKey }),
    onauxclick: (e) => e.button === 1 && window.panel.act('open', { url: s.url, newTab: true }),
  }, h('span', { class: 'url' }, bare(s.url)), h('span', { class: 'title' }, s.title && bare(s.title) !== bare(s.url) ? s.title : ''))));
});
