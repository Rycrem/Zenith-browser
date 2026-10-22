'use strict';

// Ctrl+Entrée : la commande (adresse, recherche…) s'ouvre dans un nouvel onglet.
let newTabNext = false;
cols.forEach((c, i) => {
  c.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newTab = newTabNext && !awaiting;
    newTabNext = false;
    const line = c.input.value;
    setInput(c.input, '');
    if (line.trim() && !awaiting && !SECRET.test(line) && cmdHistory[cmdHistory.length - 1] !== line) {
      cmdHistory.push(line);
      if (cmdHistory.length > 300) cmdHistory.shift();
      persist('cmdHistory', cmdHistory);
    }
    histIndex = cmdHistory.length;
    run(line, { newTab });
  });
  // Écrire sous un écran le rend actif.
  c.input.addEventListener('focus', () => state && state.activePane !== i && state.panes[i] && api.pane(i));
  // Un collage sur plusieurs lignes reste une seule commande.
  c.input.addEventListener('input', () => {
    if (/[\r\n]/.test(c.input.value)) {
      const pos = c.input.selectionStart;
      c.input.value = c.input.value.replace(/\r?\n/g, ' ');
      c.input.setSelectionRange(pos, pos);
    }
    grow(c.input);
  });
  c.input.addEventListener('keydown', async (e) => {
    const ta = c.input;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) newTabNext = true;
      c.form.requestSubmit();
    } else if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      // Ctrl+C sans sélection annule la saisie, comme dans un terminal.
      e.preventDefault();
      if (ta.value) print([{ t: `❯ ${masked(ta.value)}^C`, c: 'cmd' }]);
      setInput(ta, '');
      histIndex = cmdHistory.length;
    } else if (e.ctrlKey || e.altKey || e.metaKey) {
      // Les autres raccourcis (Ctrl+Tab, Alt+←…) restent ceux du navigateur.
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      histIndex = Math.max(0, Math.min(cmdHistory.length, histIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      setInput(ta, cmdHistory[histIndex] || '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const res = await api.complete(ta.value);
      setInput(ta, res.line);
      if (res.options.length) print([{ t: `  ${res.options.join('   ')}`, c: 'dim' }]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput(ta, '');
      api.focusPage();
    }
  });
});

// Taper n'importe où dans l'interface renvoie au terminal.
document.addEventListener('keydown', (e) => {
  if (isField(e.target) || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  activeCol().input.focus();
});

function setTerminalHidden(hidden) {
  app.classList.toggle('term-hidden', hidden);
  persist('termHidden', hidden);
  if (hidden) api.focusPage();
  else activeCol().input.focus();
  requestAnimationFrame(sendRects);
}

api.on('term:print', print);
// Popups de la barre du bas, au-dessus de leur bouton : ↓ (bord droit) ou ★ (bord gauche).
function openPanel(kind) {
  const b = $({ dl: '#dl-chip', fav: '#fav-chip', audio: '#audio-chip', ext: '#ext-chip' }[kind]);
  const r = b && b.getBoundingClientRect();
  api.panel(kind, r ? (kind === 'fav' ? r.left : r.right) : undefined);
}
// Ctrl+Maj+J, Ctrl+Maj+B et Ctrl+Maj+E.
api.on('ui:panel', openPanel);
api.on('term:clear', () => term().replaceChildren());
api.on('term:toggle', () => setTerminalHidden(!app.classList.contains('term-hidden')));
api.on('term:focus', (prefill) => {
  if (app.classList.contains('term-hidden')) setTerminalHidden(false);
  const ta = activeCol().input;
  if (prefill) setInput(ta, prefill);
  ta.focus();
});
