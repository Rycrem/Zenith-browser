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

// Roue dentée du bouton des réglages.
function gearIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('cx', '8');
  ring.setAttribute('cy', '8');
  ring.setAttribute('r', '2.2');
  const teeth = document.createElementNS(NS, 'path');
  teeth.setAttribute('d', 'M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4M8 4.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 1 0 0-7.6z');
  for (const el of [ring, teeth]) {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.5');
    el.setAttribute('stroke-linecap', 'round');
    svg.append(el);
  }
  return svg;
}

// Nadir : une étoile à quatre branches.
function nadirIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'nadir-icon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M8 1.5C8.6 5.6 10.4 7.4 14.5 8C10.4 8.6 8.6 10.4 8 14.5C7.4 10.4 5.6 8.6 1.5 8C5.6 7.4 7.4 5.6 8 1.5z');
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

function fill(el, children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}
