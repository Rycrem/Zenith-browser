'use strict';

$('#url-reload').append(reloadIcon());
$('#url-reload').addEventListener('click', () => run('reload', { echo: false }));

// L'adresse en haut se modifie à la main (Entrée : y aller, Échap : annuler) ; le bouton à droite la copie.
// En tapant, l'historique propose des pages (↑/↓ pour choisir, clic pour y aller).
const urlInput = $('#url');
// Au repos, seul le site s'affiche ; un clic montre l'adresse complète.
const siteOf = (url) => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host : url;
  } catch {
    return url;
  }
};
let suggestions = [];
let suggestSel = -1;
let suggestTyped = '';
const urlRect = () => {
  const r = $('#url-form').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};
function closeSuggest() {
  suggestions = [];
  suggestSel = -1;
  api.suggestHide();
}
$('#url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  closeSuggest();
  urlInput.blur();
  if (!url || url === state.status.url) return;
  await run(`go ${url}`);
  api.focusPage();
});
urlInput.addEventListener('focus', () => {
  urlInput.value = state.status.url;
  urlInput.select();
});
urlInput.addEventListener('input', async () => {
  suggestTyped = urlInput.value;
  suggestSel = -1;
  const list = await api.suggest(urlInput.value, urlRect());
  if (document.activeElement === urlInput) suggestions = list;
  else api.suggestHide();
});
urlInput.addEventListener('keydown', async (e) => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
    e.preventDefault();
    const n = suggestions.length;
    // -1 : ce qui a été tapé ; 0..n-1 : une suggestion.
    suggestSel = ((suggestSel + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n + 1) % (n + 1)) - 1;
    urlInput.value = suggestSel >= 0 ? suggestions[suggestSel].url : suggestTyped;
    api.suggestSelect(suggestSel, urlRect());
    return;
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const url = urlInput.value.trim();
    closeSuggest();
    urlInput.blur();
    if (url) await run(`tab new ${url}`);
    return;
  }
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (suggestions.length) {
    urlInput.value = suggestTyped;
    closeSuggest();
    return;
  }
  urlInput.value = state.status.url;
  urlInput.blur();
});
urlInput.addEventListener('blur', () => {
  urlInput.value = siteOf(state.status.url);
  // Laisse passer un clic sur une suggestion avant de fermer la liste.
  setTimeout(() => { if (document.activeElement !== urlInput) closeSuggest(); }, 200);
});
api.on('suggest:done', () => urlInput.blur());
// ☆ : la page dans les favoris ; ★ (déjà dedans) l'en retire.
$('#url-fav').addEventListener('click', () => api.favToggle());
function renderFavButton() {
  const b = $('#url-fav');
  const on = !!state.status.fav;
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
  b.disabled = !state.status.url || /^(zenith|about):/.test(state.status.url) || state.status.mode !== 'SITE';
  b.title = on ? t('Retirer des favoris ({path})', { path: state.status.fav }) : t('Ajouter aux favoris');
  b.setAttribute('aria-label', b.title);
}
let copiedTimer = null;
$('#url-copy').append(copyIcon());
$('#url-copy').addEventListener('click', () => {
  const url = state.status.url;
  if (!url) return;
  api.writeClipboard(url);
  const tip = $('#copied');
  tip.hidden = false;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { tip.hidden = true; }, 1200);
});
