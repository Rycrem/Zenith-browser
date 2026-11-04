'use strict';

// Icônes de WhatsApp, Messages et Discord (barre du bas, tiroir des applis, tiroir de discussion).
const MESSENGER_ICONS = {
  // Bulle verte avec un combiné.
  whatsapp: [
    ['M12 2.2a9.8 9.8 0 0 0-8.5 14.7L2.2 21.8l5-1.3A9.8 9.8 0 1 0 12 2.2z', '#25D366'],
    ['M8.6 7.2c.3-.3.8-.3 1 .1l1 1.8c.2.3.1.7-.1 1l-.6.6c.6 1.3 1.6 2.3 2.9 2.9l.6-.6c.3-.3.7-.3 1-.1l1.8 1c.4.2.4.7.1 1l-.8.9c-.5.5-1.2.7-1.9.4a9.6 9.6 0 0 1-5.6-5.6c-.3-.7-.1-1.4.4-1.9z', '#fff'],
  ],
  // Bulle bleue avec deux lignes de texte.
  messages: [
    ['M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', '#1A73E8'],
    ['M6.5 7h11a1 1 0 0 1 0 2h-11a1 1 0 0 1 0-2zM6.5 10.5h7a1 1 0 0 1 0 2h-7a1 1 0 0 1 0-2z', '#fff'],
  ],
  // Carré arrondi bleu-violet avec un visage.
  discord: [
    ['M5 3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', '#5865F2'],
    ['M7.6 8.2c1.4-.7 2.8-1 4.4-1s3 .3 4.4 1c.9 1.4 1.4 3.2 1.5 5.5-1 .9-2.1 1.4-3.2 1.7l-.6-1c-1.4.4-2.8.4-4.2 0l-.6 1c-1.1-.3-2.2-.8-3.2-1.7.1-2.3.6-4.1 1.5-5.5z', '#fff'],
    ['M9.8 11.2a1 1.1 0 1 0 0 2.2a1 1.1 0 1 0 0-2.2zM14.2 11.2a1 1.1 0 1 0 0 2.2a1 1.1 0 1 0 0-2.2z', '#5865F2'],
  ],
};

function messengerIcon(id) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'app-icon');
  for (const [d, fill] of MESSENGER_ICONS[id] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    svg.append(p);
  }
  return svg;
}

// Chevron de la flèche des applis : vers le haut, ou vers le bas quand le tiroir est ouvert.
function chevronIcon(down) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'chevron-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', down ? 'M3 6l5 5 5-5' : 'M3 10l5-5 5 5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}
