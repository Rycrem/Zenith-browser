'use strict';

applyStaticLabels();
renderPs1();
print([{ t: t('Zenith prêt. Ctrl+H revient ici, Ctrl+L vide le terminal, Ctrl+J le cache, Échap rend la main à la page.'), c: 'dim' }]);
api.ready();
cols[0].input.focus();

// Clic droit dans le terminal, comme dans le Terminal Windows : copie le texte sélectionné,
// sinon colle le presse-papier dans la ligne de commande.
$('#terminal').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const c = cols.find((x) => x.el.contains(e.target)) || activeCol();
  const input = c.input;
  const inInput = document.activeElement === input && input.selectionStart !== input.selectionEnd;
  const selected = inInput ? input.value.slice(input.selectionStart, input.selectionEnd) : String(window.getSelection());
  if (selected) {
    api.writeClipboard(selected);
    window.getSelection().removeAllRanges();
    input.focus();
    return;
  }
  const text = (await api.readClipboard()).replace(/\r?\n/g, ' ').trim();
  input.focus();
  if (text) input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  grow(input);
});
