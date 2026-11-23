'use strict';

// ------------------------------------------------ rendu de l'état

// En split, la barre d'adresse de la barre d'onglets passe au-dessus du terminal du premier écran ;
// celle du second écran y est déjà.
function placeUrlBar() {
  const { form, input } = urlBars[0];
  const target = state.panes.length > 1 ? $('#url-row .url-cell[data-pane="0"]') : $('#tabbar');
  if (form.parentNode === target) return;
  const focused = document.activeElement === input;
  target.append(form);
  if (focused) input.focus();
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
