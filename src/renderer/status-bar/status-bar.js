'use strict';

// La couleur passe par le style de l'élément : la CSP de l'interface refuse l'attribut style.
function extBadge(e) {
  const b = h('span', { class: 'ext-badge' }, e.badge);
  if (e.badgeColor) b.style.background = e.badgeColor;
  return b;
}

function renderStatus() {
  // Pendant qu'on fait glisser le volume, ne pas recréer la barre (le curseur serait lâché).
  if (volumeDragging) return;
  const s = state.status;
  // Seules les extensions épinglées (★ dans la popup des extensions) ont leur pastille : leur logo,
  // ou leur nom court si elles n'en ont pas. Le numéro (Alt+n) reste dans l'info-bulle.
  const chips = state.exts.filter((e) => e.pinned).map((e) => h('button', {
    type: 'button',
    class: `chip ext${e.enabled ? '' : ' off'}`,
    title: `${e.name}${e.enabled ? '' : t(' (désactivée)')}${e.error ? ` : ${e.error}` : ''} · Alt+${e.n}`,
    onclick: (ev) => api.extPopup(e.n, ev.currentTarget.getBoundingClientRect().right),
  }, e.icon ? h('img', { class: 'ext-icon', src: e.icon, alt: e.alias }) : e.alias, e.enabled ? null : ' ⏸',
  // Pastille de l'extension (chrome.action.setBadgeText), à sa couleur.
  e.badge && e.enabled ? extBadge(e) : null));
  fill($('#status'), [
    h('button', { type: 'button', id: 'fav-chip', class: 'chip', title: t('Favoris (Ctrl+Maj+B)'), onclick: () => openPanel('fav') }, t('★ favoris')),
    s.mode === 'TTY' ? h('span', {}, 'TTY') : null,
    h('span', { class: 'addr' }, s.host),
    s.fav ? h('span', {}, `★ ${s.fav}`) : null,
    s.split ? h('span', {}, t('split · écran {n}', { n: state.activePane + 1 })) : null,
    s.devtools ? h('span', { class: 'dev' },
      'DevTools ',
      s.devtools === 'docked'
        ? h('button', { type: 'button', class: 'pill', title: t('Détacher dans une fenêtre (devtools detach)'), onclick: () => api.devtools('detach') }, t('⇱ détacher'))
        : h('button', { type: 'button', class: 'pill', title: t('Remettre à côté de la page'), onclick: () => api.devtools('attach') }, t('⇲ rattacher')),
      ' ',
      h('button', { type: 'button', class: 'pill', title: t('Fermer les DevTools (F12)'), onclick: () => api.devtools('close') }, t('✕ fermer'))) : null,
    s.zoom !== 100 ? h('button', { type: 'button', class: 'pill zoom', title: t('Revenir à 100 % (Ctrl+0)'), onclick: () => api.resetZoom() }, t('zoom {zoom} %', { zoom: s.zoom })) : null,
    h('span', { class: 'grow' }),
    state.audio.show ? player(state.audio) : null,
    appsGroup(),
    chips,
    h('button', {
      type: 'button',
      id: 'ext-chip',
      class: 'chip',
      title: t('Extensions (Ctrl+Maj+E)'),
      onclick: () => openPanel('ext'),
    }, puzzleIcon()),
    dlChip(),
    // Réglages (mode nuit/jour compris), à la place de l'ancien bouton du thème.
    h('button', {
      type: 'button',
      id: 'settings-chip',
      class: 'chip',
      title: t('Réglages (settings)'),
      onclick: () => run('settings', { echo: false }),
    }, gearIcon()),
    // Nadir, tout à droite : l'étoile tourne pendant qu'il réfléchit, le point vert dit que son modèle est en mémoire.
    h('button', {
      type: 'button',
      id: 'nadir-chip',
      class: `chip${state.nadir && state.nadir.running ? ' running' : ''}${state.nadir && state.nadir.busy ? ' busy' : ''}`,
      title: state.nadir && state.nadir.running ? t('Nadir, l\'assistant (Ctrl+Maj+A) · modèle en mémoire') : t('Nadir, l\'assistant (Ctrl+Maj+A)'),
      onclick: () => openPanel('nadir'),
    }, nadirIcon()),
  ]);
}

// Bouton ↓ : l'icône plonge quand un téléchargement commence, et un liseré vert fait le tour du
// bouton à mesure que le dernier téléchargement avance. Le bouton est recréé à chaque état :
// l'animation reprend où elle en était grâce à un délai négatif.
const DL_START_MS = 900;
function dlChip() {
  const last = state.lastDownload;
  const since = last ? Date.now() - last.startedAt : Infinity;
  const started = since < DL_START_MS;
  const progress = last && last.progress !== null ? last.progress : null;
  const chip = h('button', {
    type: 'button',
    id: 'dl-chip',
    class: `chip${state.downloads ? ' busy' : ''}${started ? ' started' : ''}${progress !== null ? ' progress' : ''}`,
    title: t('Téléchargements (Ctrl+J)'),
    onclick: () => openPanel('dl'),
  }, downloadIcon(), state.downloads ? ` ${state.downloads}` : null);
  if (started) chip.style.setProperty('--dl-delay', `-${since}ms`);
  if (progress !== null) chip.style.setProperty('--p', progress.toFixed(3));
  return chip;
}

// ------------------------------------------------ WhatsApp, Messages, Discord

// Flèche ⌃ (le tiroir des applis, avec un point rouge si une appli non épinglée a du nouveau),
// puis les applis épinglées. Pendant qu'on glisse une appli du tiroir, sa place est marquée.
let appsHover = null; // { id, index }

function appsGroup() {
  const m = state.messengers;
  if (!m) return null;
  const byId = Object.fromEntries(m.apps.map((a) => [a.id, a]));
  const hidden = m.apps.some((a) => !m.pinned.includes(a.id) && a.unread);
  const pinned = m.pinned.filter((id) => byId[id] && !(appsHover && appsHover.id === id));
  const items = pinned.map((id) => appChip(byId[id], m.open === id));
  if (appsHover) items.splice(appsHover.index, 0, h('span', { class: 'app-slot' }));
  return h('span', { id: 'apps-group' },
    h('button', {
      type: 'button',
      id: 'apps-chip',
      class: `apps-arrow${hidden ? ' unread' : ''}`,
      title: t('Applis : WhatsApp, Messages, Gmail, Chat, Discord'),
      'aria-label': t('Applis : WhatsApp, Messages, Gmail, Chat, Discord'),
      onclick: () => openPanel('apps'),
    }, chevronIcon(m.trayOpen)),
    items,
    h('span', { class: 'apps-sep' }));
}

function appChip(a, open) {
  const unread = a.unread > 0 ? t('{n} non lus', { n: a.unread }) : a.unread < 0 ? t('nouveaux messages') : '';
  return h('button', {
    type: 'button',
    class: `chip app${open ? ' open' : ''}`,
    'data-app': a.id,
    title: `${a.name}${unread ? ` · ${unread}` : ''} (« ${a.id} »)`,
    onclick: (e) => api.messenger(a.id, e.currentTarget.getBoundingClientRect().right),
    oncontextmenu: (e) => {
      e.preventDefault();
      api.messengerMenu(a.id);
    },
  }, messengerIcon(a.id), a.unread > 0 ? h('span', { class: 'app-badge' }, a.unread > 99 ? '99+' : a.unread) : a.unread < 0 ? h('span', { class: 'app-badge dot' }) : null);
}

// Place d'une appli lâchée à l'abscisse x : parmi les épinglées, juste après la flèche au plus à gauche.
function appsIndexAt(id, x) {
  const chipsEl = [...document.querySelectorAll('#apps-group .chip.app')].filter((el) => el.dataset.app !== id);
  return chipsEl.filter((el) => {
    const r = el.getBoundingClientRect();
    return x > r.left + r.width / 2;
  }).length;
}

api.on('ui:apps-hover', (hv) => {
  const next = hv ? { id: hv.id, index: appsIndexAt(hv.id, hv.x) } : null;
  if (JSON.stringify(next) === JSON.stringify(appsHover)) return;
  appsHover = next;
  renderStatus();
});

api.on('ui:apps-drop', (d) => {
  api.messengerPin(d.id, appsIndexAt(d.id, d.x));
  appsHover = null;
  renderStatus();
});

// Commande « whatsapp » : le tiroir s'ouvre au-dessus de l'icône épinglée, sinon de la flèche.
api.on('ui:messenger', (id) => {
  const b = document.querySelector(`#apps-group .chip.app[data-app="${id}"]`) || $('#apps-chip');
  api.messenger(id, b ? b.getBoundingClientRect().right : undefined);
});
