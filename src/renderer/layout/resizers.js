'use strict';

// ------------------------------------------------ redimensionnement à la souris

function dragger(handle, onMove, onEnd) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // la capture n'est pas indispensable : on écoute aussi la fenêtre
    }
    handle.classList.add('dragging');
    api.drag(true); // les pages sont masquées pendant le glissement pour garder la souris
    const move = (ev) => {
      onMove(ev);
      sendRects();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
      handle.classList.remove('dragging');
      api.drag(false);
      onEnd();
      sendRects();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
  });
}

let termH = load('termH', 220);
let ratio = load('paneRatio', 0.5);
document.documentElement.style.setProperty('--term-h', `${termH}px`);
document.documentElement.style.setProperty('--ratio', ratio);
if (load('termHidden', false)) app.classList.add('term-hidden');

dragger($('#resizer'), (e) => {
  termH = Math.round(Math.min(Math.max(window.innerHeight - e.clientY - 28, 70), window.innerHeight - 140));
  document.documentElement.style.setProperty('--term-h', `${termH}px`);
}, () => persist('termH', termH));

$('#resizer').addEventListener('dblclick', () => {
  termH = 220;
  document.documentElement.style.setProperty('--term-h', '220px');
  persist('termH', termH);
  requestAnimationFrame(sendRects);
});

dragger($('.pane-resizer'), (e) => {
  const r = content.getBoundingClientRect();
  ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0.15), 0.85);
  document.documentElement.style.setProperty('--ratio', ratio);
  alignTabGroups();
}, () => persist('paneRatio', ratio));

// Envoyé seulement quand la place des écrans change : chaque envoi replace toutes les pages.
let sentRects = '';
function sendRects() {
  alignTabGroups();
  const split = state && state.panes.length > 1;
  const rects = panesEl.map((p, i) => {
    if (i > 0 && !split) return null;
    const r = $('.viewport', p).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const key = JSON.stringify(rects);
  if (key === sentRects) return;
  sentRects = key;
  api.layout(rects);
}

new ResizeObserver(sendRects).observe(content);
window.addEventListener('resize', sendRects);
