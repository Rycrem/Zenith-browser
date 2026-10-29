'use strict';

// Question au milieu de la fenêtre (installer une extension…) : Entrée ou le bouton principal
// acceptent, Échap ou Annuler refusent.

$('#ok').addEventListener('click', () => window.panel.act('ok'));
$('#cancel').addEventListener('click', () => window.panel.act('cancel'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.panel.act('cancel');
});

window.panel.onData((d) => {
  $('#message').textContent = d.message;
  $('#detail').replaceChildren(...(d.details || []).map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  $('#detail').hidden = !(d.details || []).length;
  $('#detail-label').textContent = d.detailLabel || '';
  $('#detail-label').hidden = !d.detailLabel;
  if (d.title) $('#title').textContent = d.title;
  $('#ok').textContent = d.ok;
  $('#cancel').textContent = d.cancel;
  $('#ok').focus();
  window.panel.size(document.querySelector('#pop').getBoundingClientRect().height);
});
