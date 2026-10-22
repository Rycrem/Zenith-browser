'use strict';

// Player du son : lecture/pause, haut-parleur (couper tout), volume du navigateur avec son pourcentage,
// et ▴ pour régler chaque onglet.
let volumeDragging = false;
// Le player tient dans une seule carte : lecture/pause, volume, pourcentage (clic : muet), son de chaque onglet.
function player(a) {
  const pct = Math.round(a.volume * 100);
  const play = h('button', {
    type: 'button',
    class: 'pl-btn',
    title: a.playing ? t('Mettre en pause') : t('Reprendre la lecture'),
    onclick: () => api.mediaToggle(),
  }, playIcon(a.playing));
  const value = h('button', {
    type: 'button',
    class: 'pl-btn volume-pct',
    title: a.muted ? t('Remettre le son') : t('Couper le son'),
    onclick: () => api.muteAll(),
  }, `${pct} %`);
  const slider = h('input', {
    type: 'range',
    class: 'volume',
    min: '0',
    max: '100',
    value: String(pct),
    title: t('Volume du navigateur : {v} %', { v: pct }),
    onpointerdown: () => { volumeDragging = true; },
    oninput: (e) => {
      value.textContent = `${e.target.value} %`;
      e.target.style.setProperty('--fill', `${e.target.value}%`);
      api.volume(Number(e.target.value) / 100);
    },
  });
  slider.style.setProperty('--fill', `${pct}%`);
  const tabsBtn = h('button', {
    type: 'button',
    id: 'audio-chip',
    class: 'pl-btn',
    title: t('Son de chaque onglet'),
    onclick: () => openPanel('audio'),
  }, '▴');
  return h('span', { class: `player${a.muted ? ' muted' : ''}` }, play, h('span', { class: 'pl-sep' }), slider, value, h('span', { class: 'pl-sep' }), tabsBtn);
}

function playIcon(playing) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mode-icon');
  for (const d of playing ? ['M5 3.5v9', 'M11 3.5v9'] : ['M5 3.2v9.6L12.6 8z']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', playing ? 'none' : 'currentColor');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', playing ? '2.2' : '1.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

// Le bouton peut être relâché hors du curseur.
window.addEventListener('pointerup', () => {
  if (!volumeDragging) return;
  volumeDragging = false;
  renderStatus();
});
