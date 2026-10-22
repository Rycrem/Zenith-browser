'use strict';

// replaceChildren sans les valeurs vides et avec les tableaux aplatis.
// Haut-parleur en SVG (même rendu partout) : avec ondes, ou barré quand le son est coupé.
function speaker(muted) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'speaker-icon');
  const path = (d, fill) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    return p;
  };
  svg.append(path('M2 6h3l4-3v10l-4-3H2z', true));
  if (muted) svg.append(path('M11 6l4 4M15 6l-4 4'));
  else svg.append(path('M11 5.5a3.5 3.5 0 0 1 0 5'), path('M12.8 3.5a6 6 0 0 1 0 9'));
  return svg;
}

// Icône de téléchargement : flèche vers le bas au-dessus d'une barre arrondie.
function downloadIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'dl-icon');
  for (const d of ['M8 1.8v8.4', 'M4.4 6.8L8 10.4l3.6-3.6', 'M3.6 13.4h8.8']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function copyIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'copy-icon');
  // Deux cartes arrondies décalées : celle de devant pleine de la couleur du fond.
  for (const d of ['M5.5 5.5h7a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 13V7a1.5 1.5 0 0 1 1.5-1.5z', 'M2 10V3.5A1.5 1.5 0 0 1 3.5 2H10']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.4');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
  }
  return svg;
}

function reloadIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'copy-icon');
  for (const d of ['M13 8a5 5 0 1 1-1.46-3.54', 'M13 2.5v3h-3']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function puzzleIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M6 3.2a1.6 1.6 0 0 1 3.2 0V4.4h3.4v3.4h-1.2a1.6 1.6 0 0 0 0 3.2h1.2v3.4H9.2v-1.2a1.6 1.6 0 0 0-3.2 0v1.2H2.6v-3.4h1.2a1.6 1.6 0 0 0 0-3.2H2.6V4.4H6z');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

// Lune en mode jour (passer en nuit), soleil en mode nuit (passer en jour).
function modeIcon(light) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  const d = light
    ? ['M13.2 9.6A5.6 5.6 0 1 1 6.4 2.8a4.4 4.4 0 0 0 6.8 6.8z']
    : ['M8 5.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6z', 'M8 1.2v1.4', 'M8 13.4v1.4', 'M1.2 8h1.4', 'M13.4 8h1.4', 'M3.2 3.2l1 1', 'M11.8 11.8l1 1', 'M3.2 12.8l1-1', 'M11.8 4.2l1-1'];
  for (const x of d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', x);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function fill(el, children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}
