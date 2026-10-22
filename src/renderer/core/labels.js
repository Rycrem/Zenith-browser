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
    b.setAttribute('aria-label', t('Onglet précédent'));
    b.title = t('Onglet précédent (Ctrl+Maj+Tab)');
  }
  for (const b of document.querySelectorAll('.tab-next')) {
    b.setAttribute('aria-label', t('Onglet suivant'));
    b.title = t('Onglet suivant (Ctrl+Tab)');
  }
  $('#url').title = t('Modifier l\'adresse (Entrée pour y aller)');
  $('#url').placeholder = t('adresse ou recherche');
  $('#url-copy').title = t('Copier l\'adresse');
  $('#url-copy').setAttribute('aria-label', t('Copier l\'adresse'));
  $('#copied').textContent = t('copié');
  $('.pane-resizer').title = t('Glisser pour redimensionner');
  $('#resizer').title = t('Glisser pour redimensionner le terminal (double-clic : taille par défaut)');
  for (const b of document.querySelectorAll('.devbar .detach')) b.title = t('Détacher dans une fenêtre (devtools detach)');
  for (const b of document.querySelectorAll('.devbar .close')) b.title = t('Fermer les DevTools (F12)');
}
