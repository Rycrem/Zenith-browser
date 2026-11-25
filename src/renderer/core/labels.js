'use strict';

// Libellés écrits dans index.html : traduits au démarrage et quand la langue change.
function applyStaticLabels() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll('.tab-strip')) el.setAttribute('aria-label', t('Onglets'));
  for (const b of document.querySelectorAll('.new-tab')) {
    b.setAttribute('aria-label', t('Nouvel onglet'));
    b.title = t('Nouvel onglet (Ctrl+T)');
  }
  for (const b of document.querySelectorAll('.tab-prev')) {
    b.setAttribute('aria-label', t('Page précédente'));
    b.title = t('Page précédente (Alt+←)');
  }
  for (const b of document.querySelectorAll('.tab-next')) {
    b.setAttribute('aria-label', t('Page suivante'));
    b.title = t('Page suivante (Alt+→)');
  }
  for (const el of document.querySelectorAll('.url-input')) {
    el.title = t('Modifier l\'adresse (Entrée pour y aller)');
    el.placeholder = t('adresse ou recherche');
  }
  for (const el of document.querySelectorAll('.url-copy')) {
    el.title = t('Copier l\'adresse');
    el.setAttribute('aria-label', t('Copier l\'adresse'));
  }
  for (const el of document.querySelectorAll('.url .copied')) el.textContent = t('copié');
  $('.pane-resizer').title = t('Glisser pour redimensionner');
  $('#resizer').title = t('Glisser pour redimensionner le terminal (double-clic : taille par défaut)');
  for (const b of document.querySelectorAll('.devbar .detach')) b.title = t('Détacher dans une fenêtre (devtools detach)');
  for (const b of document.querySelectorAll('.devbar .close')) b.title = t('Fermer les DevTools (F12)');
}
