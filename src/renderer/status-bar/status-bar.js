'use strict';

function renderStatus() {
  // Pendant qu'on fait glisser le volume, ne pas recréer la barre (le curseur serait lâché).
  if (volumeDragging) return;
  const s = state.status;
  // Seules les extensions épinglées (★ dans la popup des extensions) ont leur pastille.
  const chips = state.exts.filter((e) => e.pinned).map((e) => h('button', {
    type: 'button',
    class: `chip${e.enabled ? '' : ' off'}`,
    title: `${e.name}${e.enabled ? '' : t(' (désactivée)')}${e.error ? ` : ${e.error}` : ''} · Alt+${e.n}`,
    onclick: (ev) => api.extPopup(e.n, ev.currentTarget.getBoundingClientRect().right),
  }, `${e.n} ${e.alias}${e.enabled ? '' : ' ⏸'}`));
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
    chips,
    h('button', {
      type: 'button',
      id: 'ext-chip',
      class: 'chip',
      title: t('Extensions (Ctrl+Maj+E)'),
      onclick: () => openPanel('ext'),
    }, puzzleIcon()),
    dlChip(),
    // Le bouton du thème est à la place de l'ancienne heure.
    h('button', {
      type: 'button',
      id: 'mode-chip',
      class: 'chip',
      title: state.light ? t('Passer en mode nuit') : t('Passer en mode jour'),
      onclick: () => api.toggleMode(),
    }, modeIcon(state.light)),
    // Nadir, tout à droite ; le point vert dit que son modèle est en mémoire.
    h('button', {
      type: 'button',
      id: 'nadir-chip',
      class: `chip${state.nadir && state.nadir.running ? ' running' : ''}${state.nadir && state.nadir.busy ? ' busy' : ''}`,
      title: state.nadir && state.nadir.running ? t('Nadir, l\'assistant (Ctrl+Maj+A) · modèle en mémoire') : t('Nadir, l\'assistant (Ctrl+Maj+A)'),
      onclick: () => openPanel('nadir'),
    }, nadirIcon(), 'Nadir'),
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
