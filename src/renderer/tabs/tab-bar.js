'use strict';

// Une barre d'onglets par écran : en split, elle se divise comme le terminal, chaque côté avec
// ses onglets, son + et ses flèches (onglet précédent / suivant).
const groups = [...document.querySelectorAll('.tab-group')].map((el) => ({ el, strip: $('.tab-strip', el), prev: $('.tab-prev', el), next: $('.tab-next', el), shownId: null }));
groups.forEach((g, i) => {
  const plus = $('.new-tab', g.el);
  plus.addEventListener('click', () => api.newTab(i));
  // Clic droit sur + : les onglets fermés récemment.
  plus.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.recentMenu();
  });
  g.prev.addEventListener('click', () => api.cycleTab(i, -1));
  g.next.addEventListener('click', () => api.cycleTab(i, 1));
  // La molette fait défiler les onglets de côté.
  g.strip.addEventListener('wheel', (e) => {
    if (!e.deltaY || e.deltaX) return;
    e.preventDefault();
    g.strip.scrollBy({ left: e.deltaY });
  }, { passive: false });
});

// La séparation des deux barres tombe sur celle des écrans.
function alignTabGroups() {
  const g = groups[0].el;
  if (!state || state.panes.length < 2) {
    g.style.flex = '';
    return;
  }
  const edge = $('.pane-resizer').getBoundingClientRect().left;
  g.style.flex = `0 0 ${Math.max(80, Math.round(edge - g.getBoundingClientRect().left))}px`;
}

// Glisser un onglet : il suit la souris de gauche à droite, et ses voisins s'écartent doucement
// pour ouvrir la place où il sera posé ; un contour glisse vers les bords de cette place.
// Lâché, l'onglet glisse dans la place.
const TAB_SLIDE_MS = 400;
let tabDrag = null; // { id, side, el, strip, startX, moved, from, pos, w, others, center, min, max, dropping }

function slotShift(d, i) {
  if (d.from < i && i <= d.pos) return -d.w;
  if (d.pos <= i && i < d.from) return d.w;
  return 0;
}

function startTabDrag(e, tb) {
  if (e.button !== 0 || tabDrag || e.target.closest('.close, .speaker')) return;
  const el = e.currentTarget;
  const strip = el.parentNode;
  const els = [...strip.querySelectorAll('.tab')];
  const r = el.getBoundingClientRect();
  const sr = strip.getBoundingClientRect();
  const from = els.indexOf(el);
  const d = {
    id: tb.id,
    side: tb.side,
    el,
    strip,
    startX: e.clientX,
    moved: false,
    from,
    pos: from,
    w: r.width + 4,
    others: els.map((x) => {
      const b = x.getBoundingClientRect();
      return { el: x, center: b.left + b.width / 2, w: b.width + 4 };
    }),
    center: r.left + r.width / 2,
    min: sr.left - r.left,
    max: sr.right - r.right,
  };
  tabDrag = d;
  const move = (ev) => {
    const raw = ev.clientX - d.startX;
    if (!d.moved && Math.abs(raw) < 5) return;
    if (!d.moved) {
      d.moved = true;
      el.classList.add('dragging');
      strip.classList.add('sorting');
    }
    el.style.transform = `translateX(${Math.min(Math.max(raw, d.min), d.max)}px)`;
    // Sa place : après chaque voisin dont la souris a dépassé le milieu (même hors de la barre,
    // pour pouvoir le poser tout au bout).
    const c = d.center + raw;
    const pos = d.others.filter((o, i) => i !== d.from && o.center < c).length;
    if (pos === d.pos) return;
    d.pos = pos;
    const rest = d.others.filter((o, i) => i !== d.from);
    d.others.forEach((o, i) => {
      if (i === d.from) return;
      const s = slotShift(d, i);
      o.el.style.transform = s ? `translateX(${s}px)` : '';
      o.el.classList.toggle('drop-r', pos !== d.from && o === rest[pos - 1]);
      o.el.classList.toggle('drop-l', pos !== d.from && o === rest[pos]);
    });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('blur', up);
    if (!d.moved) {
      tabDrag = null;
      return;
    }
    // Le clic qui suit le glissement ne doit pas changer d'onglet.
    window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
    d.dropping = true;
    const lo = Math.min(d.from, d.pos);
    const hi = Math.max(d.from, d.pos);
    const slot = d.others.slice(lo, hi + 1).filter((o, k) => lo + k !== d.from).reduce((sum, o) => sum + o.w, 0);
    el.classList.add('settling');
    el.style.transform = `translateX(${d.pos > d.from ? slot : -slot}px)`;
    setTimeout(() => {
      tabDrag = null;
      if (d.pos !== d.from) {
        const offset = state.tabs.findIndex((x) => x.side === d.side);
        api.moveTab(d.id, offset + (d.pos > d.from ? d.pos + 1 : d.pos));
      }
      renderTabs();
    }, TAB_SLIDE_MS);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('blur', up);
}

function tabEl(tb, shown) {
  return h(
    'div',
    {
      class: `tab${shown ? ' active' : ''}${tb.private ? ' private' : ''}`,
      // Clic molette : ferme l'onglet.
      onmousedown: (e) => { if (e.button === 1) e.preventDefault(); },
      onauxclick: (e) => { if (e.button === 1) api.closeTab(tb.id); },
      onpointerdown: (e) => startTabDrag(e, tb),
    },
    h('button', { type: 'button', class: 'label', title: tb.title, onclick: () => api.tab(tb.id) }, tb.loading ? h('span', { class: 'spin', 'aria-label': t('chargement…') }) : tb.favicon ? h('img', { class: 'favicon', src: tb.favicon, alt: '' }) : null, h('span', { class: 'text' }, `[${tb.n}] `, tb.title)),
    tb.audible || tb.muted ? h('button', {
      type: 'button',
      class: `speaker${tb.muted ? ' muted' : ''}`,
      title: tb.muted ? t('Remettre le son de l\'onglet') : t('Couper le son de l\'onglet'),
      onclick: (e) => {
        e.stopPropagation();
        api.tabMute(tb.id);
      },
    }, speaker(tb.muted)) : null,
    h('button', { type: 'button', class: 'close', 'aria-label': t('Fermer l\'onglet {n}', { n: tb.n }), onclick: () => api.closeTab(tb.id) }, '×'),
  );
}

function renderTabs() {
  if (tabDrag && tabDrag.moved) return; // rendu à la fin du glissement
  const split = state.panes.length > 1;
  groups.forEach((g, i) => {
    g.el.classList.toggle('active', split && i === state.activePane);
    if (i > 0 && !split) {
      fill(g.strip, []);
      g.shownId = null;
      return;
    }
    const shownId = state.panes[i].tabId;
    const list = state.tabs.filter((tb) => tb.side === i);
    fill(g.strip, list.map((tb) => tabEl(tb, tb.id === shownId)));
    g.prev.disabled = list.length < 2;
    g.next.disabled = list.length < 2;
    // L'onglet affiché reste visible dans sa barre.
    if (shownId !== g.shownId) {
      g.shownId = shownId;
      const el = $('.tab.active', g.strip);
      if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  });
  // Pas pendant qu'on la modifie.
  if (document.activeElement !== urlInput) urlInput.value = siteOf(state.status.url);
}

function renderPanes() {
  content.classList.toggle('split', state.panes.length > 1);
  state.panes.forEach((p, i) => {
    const pane = panesEl[i];
    const viewport = $('.viewport', pane);
    pane.classList.toggle('active', i === state.activePane);
    // Navigation privée d'un seul écran (split) : son écran et son terminal passent en violet.
    for (const el of [pane, cols[i].el]) {
      if (p.private && !state.private) el.dataset.private = '1';
      else delete el.dataset.private;
    }
    cols[i].el.classList.toggle('active', i === state.activePane);
    viewport.classList.toggle('has-screen', !!p.screen);
    viewport.classList.toggle('page', !p.screen && p.page);
    // Barre au-dessus des DevTools collées à la page : on peut les détacher ou les fermer à la souris.
    let bar = $('.devbar', viewport);
    if (!bar) {
      bar = h('div', { class: 'devbar' },
        h('span', { class: 'dim' }, 'DevTools'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'detach', title: t('Détacher dans une fenêtre (devtools detach)'), onclick: () => api.devtools('detach') }, '⇱'),
        h('button', { type: 'button', class: 'close', title: t('Fermer les DevTools (F12)'), onclick: () => api.devtools('close') }, '✕'));
      viewport.append(bar);
    }
    bar.hidden = !p.dev;
    fill($('.pane-bar', pane), state.panes.length > 1 ? [
      h('span', { class: 'pane-title' }, t('écran {n} · {title}', { n: i + 1, title: p.title })),
      h('button', { type: 'button', class: 'pane-close', title: t('Fermer l\'écran {n} (split off {n})', { n: i + 1 }), onclick: (ev) => { ev.stopPropagation(); run(`split off ${i + 1}`); } }, '✕'),
    ] : []);
    const screen = $('.screen', pane);
    const key = getLang() + JSON.stringify(p.screen);
    if (screen.dataset.key !== key) {
      screen.dataset.key = key;
      fill(screen, p.screen ? renderScreen(p.screen) : []);
      screen.scrollTop = p.screen && p.screen.kind === 'ai' ? screen.scrollHeight : 0;
      // La réponse finie, le curseur attend la suite de la discussion.
      const reply = $('.ai-reply textarea', screen);
      if (reply && i === state.activePane && !app.classList.contains('term-hidden')) reply.focus();
    }
  });
}
