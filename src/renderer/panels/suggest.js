'use strict';

// Suggestions sous l'adresse, tirées de l'historique. La fenêtre ne prend jamais le focus :
// le clavier reste dans le champ d'adresse, qui choisit la ligne surlignée.

const pop = $('#pop');

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
