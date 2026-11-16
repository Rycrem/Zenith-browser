'use strict';

// ------------------------------------------------ rendu de l'état

// En split, la barre d'adresse (et ses boutons) passe juste au-dessus du terminal, sur toute sa largeur.
function placeUrlBar() {
  const form = $('#url-form');
  const target = state.panes.length > 1 ? $('#url-row') : $('#tabbar');
  if (form.parentNode === target) return;
  const focused = document.activeElement === urlInput;
  target.append(form);
  if (focused) urlInput.focus();
}

api.on('state', (s) => {
  state = s;
  if (s.lang && s.lang !== getLang()) {
    setLang(s.lang);
    applyStaticLabels();
  }
  document.documentElement.style.setProperty('--accent', s.accent);
  document.documentElement.dataset.mode = s.light ? 'jour' : 'nuit';
  document.documentElement.dataset.platform = s.platform;
  if (s.private) document.documentElement.dataset.private = '1';
  else delete document.documentElement.dataset.private;
  $('.logo').textContent = s.private ? t('Zenith · privé') : 'Zenith';
  app.classList.toggle('split', s.panes.length > 1);
  placeUrlBar();
  placeTerms();
  renderTabs();
  renderPanes();
  renderStatus();
  renderPs1();
  requestAnimationFrame(sendRects);
});
