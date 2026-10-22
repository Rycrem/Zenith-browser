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
    h('button', {
      type: 'button',
      id: 'dl-chip',
      class: `chip${state.downloads ? ' busy' : ''}`,
      title: t('Téléchargements (Ctrl+Maj+J)'),
      onclick: () => openPanel('dl'),
    }, downloadIcon(), state.downloads ? ` ${state.downloads}` : null),
    // Le bouton du thème est à la place de l'ancienne heure.
    h('button', {
      type: 'button',
      id: 'mode-chip',
      class: 'chip',
      title: state.light ? t('Passer en mode nuit') : t('Passer en mode jour'),
      onclick: () => api.toggleMode(),
    }, modeIcon(state.light))
  ]);
}
