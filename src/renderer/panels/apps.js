'use strict';

// Tiroir des applis (flèche ⌃ de la barre du bas) : clic pour ouvrir, clic droit pour le menu,
// glisser vers la barre pour épingler.

const act = (action, arg) => window.panel.act(action, arg);
let dragging = null; // { id, el, x, y, moved }

function render(d) {
  if (dragging) return;
  $('#title').textContent = d.title;
  $('#total').textContent = d.total;
  $('#tiles').replaceChildren(...d.list.map((a) => {
    const tile = h('button', { type: 'button', class: `tile${a.open ? ' open' : ''}`, title: a.name, 'data-id': a.id },
      messengerIcon(a.id),
      a.unread > 0 ? h('span', { class: 'app-badge' }, a.unread > 99 ? '99+' : a.unread) : a.unread < 0 ? h('span', { class: 'app-badge dot' }) : null,
      a.pinned ? h('span', { class: 'pin', title: d.pinnedLabel }, '●') : null,
      h('span', { class: 'name' }, a.name));
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      act('menu', { id: a.id });
    });
    tile.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = { id: a.id, el: tile, x: e.screenX, y: e.screenY, moved: false };
      tile.setPointerCapture(e.pointerId);
    });
    return tile;
  }));
  window.panel.size($('#pop').offsetHeight);
}

// La souris garde la capture hors de la popup : le processus principal suit sa position sur l'écran.
document.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (!dragging.moved && Math.hypot(e.screenX - dragging.x, e.screenY - dragging.y) < 6) return;
  dragging.moved = true;
  dragging.el.classList.add('dragged');
  document.body.classList.add('dragging');
  act('drag', { id: dragging.id, sx: e.screenX, sy: e.screenY });
});

document.addEventListener('pointerup', (e) => {
  const d = dragging;
  if (!d) return;
  dragging = null;
  d.el.classList.remove('dragged');
  document.body.classList.remove('dragging');
  if (d.moved) act('drop', { id: d.id, sx: e.screenX, sy: e.screenY });
  else act('open', { id: d.id });
});

window.panel.onData(render);
