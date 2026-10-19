'use strict';

// Notes de mise à jour affichées en bas de l'écran d'accueil (la version installée).
// Ajouter une entrée en tête à chaque nouvelle version.
const CHANGELOG = [
  {
    version: '0.1.13',
    notes: ['L\'installateur Windows peut être signé, pour que le Contrôle intelligent des applications de Windows 11 ne le bloque plus.'],
  },
  {
    version: '0.1.12',
    notes: [
      'Les mises à jour sont vérifiées à chaque lancement (et plus une fois par jour).',
      'Les extensions du Chrome Web Store et uBlock Origin se mettent à jour toutes seules au lancement.',
      'Clés de sécurité (YubiKey) : quand la clé garde plusieurs comptes pour un site, le terminal demande lequel utiliser (avant, la connexion était annulée).',
    ],
  },
  {
    version: '0.1.11',
    notes: [
      'uBlock Origin est préinstallé et fonctionne : il bloque les pubs et sa popup s\'ouvre (Alt+1 ou clic sur sa pastille).',
      'Le bloqueur intégré devient un secours, éteint par défaut (« adblock on »).',
      'Clic droit sur une image : « Enregistrer l\'image » ; aussi pour les liens, vidéos et sons.',
      'Ces notes de mise à jour en bas de l\'écran d\'accueil.',
    ],
  },
  {
    version: '0.1.10',
    notes: ['« fullscreen » ou F11 : plein écran.'],
  },
  {
    version: '0.1.9',
    notes: ['« find » trouve les résultats dès la première recherche.'],
  },
  {
    version: '0.1.8',
    notes: [
      'Le clavier reste dans le terminal après une commande.',
      'Le bouton + ouvre un onglet ; un clic sur l\'adresse la copie.',
      'Le zoom s\'affiche dans la barre d\'état ; barre ⇱ ✕ au-dessus des DevTools.',
    ],
  },
];

// Notes de la version donnée, ou de la plus récente connue.
function notesFor(version) {
  return CHANGELOG.find((e) => e.version === version) || CHANGELOG[0];
}

module.exports = { CHANGELOG, notesFor };
