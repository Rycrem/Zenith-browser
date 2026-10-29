'use strict';

// Recherche dans la page (Ctrl+F) : Entrée va au premier résultat, puis au suivant à chaque appui
// (Maj+Entrée : au précédent). ↓ suivant, ↑ précédent, Échap ferme.

const q = document.querySelector('#q');
const count = document.querySelector('#count');
const find = (forward) => {
  if (q.value) window.panel.act('find', { text: q.value, forward });
};

document.querySelector('#pop').addEventListener('submit', (e) => e.preventDefault());
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    find(!e.shiftKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    window.panel.act('close');
  }
});
q.addEventListener('input', () => {
  count.textContent = '';
});
document.querySelector('#down').addEventListener('click', () => find(true));
document.querySelector('#up').addEventListener('click', () => find(false));
document.querySelector('#close').addEventListener('click', () => window.panel.act('close'));

window.panel.onData((d) => {
  if (d.labels) {
    q.placeholder = d.labels.placeholder;
    document.querySelector('#down').title = d.labels.next;
    document.querySelector('#up').title = d.labels.prev;
    document.querySelector('#close').title = d.labels.close;
  }
  if (d.text !== undefined) {
    q.value = d.text;
    q.select();
    q.focus();
  }
  if (d.matches !== undefined) count.textContent = `${d.matches ? d.ordinal : 0}/${d.matches}`;
});
