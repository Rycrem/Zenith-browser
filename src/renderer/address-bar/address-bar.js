'use strict';

// Barres d'adresse : une seule dans la barre d'onglets ; en split, une par écran, au-dessus de son
// terminal (urlBars[i] pour l'écran i). Chacune se modifie à la main (Entrée : y aller, Échap : annuler),
// propose l'historique en tapant (↑/↓ pour choisir, clic pour y aller), recharge, ajoute aux favoris, copie.

// Au repos, seul le site s'affiche ; un clic montre l'adresse complète.
const siteOf = (url) => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.host : url;
  } catch {
    return url;
  }
};

// Ce que montre la barre de l'écran i (l'écran actif hors split).
const barInfo = (i) => (state && state.panes[i] && state.panes[i].bar) || { url: '', fav: null, site: false };

const urlBars = [...document.querySelectorAll('form.url')].map((form, i) => {
  const input = $('.url-input', form);
  const bar = { form, input, i };
  let suggestions = [];
  let suggestSel = -1;
  let suggestTyped = '';
  let copiedTimer = null;
  const rect = () => {
    const r = form.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const closeSuggest = () => {
    suggestions = [];
    suggestSel = -1;
    api.suggestHide();
  };
  // Les commandes s'appliquent à l'écran actif : celui de cette barre le devient.
  const choosePane = () => {
    if (!state || state.panes.length < 2 || state.activePane === i) return;
    state.activePane = i;
    api.pane(i);
  };

  $('.url-reload', form).append(reloadIcon());
  $('.url-reload', form).addEventListener('click', () => {
    choosePane();
    run('reload', { echo: false });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    closeSuggest();
    input.blur();
    if (!url || url === barInfo(i).url) return;
    choosePane();
    await run(`go ${url}`);
    api.focusPage();
  });
  input.addEventListener('focus', () => {
    choosePane();
    input.value = barInfo(i).url;
    input.select();
  });
  input.addEventListener('input', async () => {
    suggestTyped = input.value;
    suggestSel = -1;
    const list = await api.suggest(input.value, rect());
    if (document.activeElement === input) suggestions = list;
    else api.suggestHide();
  });
  input.addEventListener('keydown', async (e) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
      e.preventDefault();
      const n = suggestions.length;
      // -1 : ce qui a été tapé ; 0..n-1 : une suggestion.
      suggestSel = ((suggestSel + 1 + (e.key === 'ArrowDown' ? 1 : -1) + n + 1) % (n + 1)) - 1;
      input.value = suggestSel >= 0 ? suggestions[suggestSel].url : suggestTyped;
      api.suggestSelect(suggestSel, rect());
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const url = input.value.trim();
      closeSuggest();
      input.blur();
      if (url) await run(`tab new ${url}`);
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (suggestions.length) {
      input.value = suggestTyped;
      closeSuggest();
      return;
    }
    input.value = barInfo(i).url;
    input.blur();
  });
  input.addEventListener('blur', () => {
    input.value = siteOf(barInfo(i).url);
    // Laisse passer un clic sur une suggestion avant de fermer la liste.
    setTimeout(() => { if (document.activeElement !== input) closeSuggest(); }, 200);
  });
  // ☆ : la page dans les favoris ; ★ (déjà dedans) l'en retire.
  $('.url-fav', form).addEventListener('click', () => {
    choosePane();
    api.favToggle();
  });
  $('.url-copy', form).append(copyIcon());
  $('.url-copy', form).addEventListener('click', () => {
    const url = barInfo(i).url;
    if (!url) return;
    api.writeClipboard(url);
    const tip = $('.copied', form);
    tip.hidden = false;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { tip.hidden = true; }, 1200);
  });
  return bar;
});
api.on('suggest:done', () => {
  for (const b of urlBars) if (document.activeElement === b.input) b.input.blur();
});

// Adresse (pas pendant qu'on la modifie) et étoile des favoris de chaque barre.
function renderUrlBars() {
  for (const { form, input, i } of urlBars) {
    const info = barInfo(i);
    if (document.activeElement !== input) input.value = siteOf(info.url);
    const b = $('.url-fav', form);
    const on = !!info.fav;
    b.textContent = on ? '★' : '☆';
    b.classList.toggle('on', on);
    b.disabled = !info.url || /^(zenith|about):/.test(info.url) || !info.site;
    b.title = on ? t('Retirer des favoris ({path})', { path: info.fav }) : t('Ajouter aux favoris');
    b.setAttribute('aria-label', b.title);
  }
}
