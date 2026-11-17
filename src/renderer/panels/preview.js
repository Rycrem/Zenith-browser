'use strict';

// Aperçu de l'onglet survolé : image de la page (si elle en a une), titre et adresse.
window.panel.onData(({ title, url, image, height }) => {
  const shot = image ? h('img', { class: 'shot', src: image, alt: '' }) : null;
  if (shot) shot.style.height = `${height}px`;
  $('#pop').replaceChildren(
    shot,
    h('div', { class: 'title' }, title),
    h('div', { class: 'url' }, url.replace(/^https?:\/\/(www\.)?/, '')),
  );
});
