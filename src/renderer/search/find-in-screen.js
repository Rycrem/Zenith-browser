'use strict';

// Ctrl+F sur un écran du terminal (historique, favoris, aide…) : les résultats sont surlignés dans
// l'écran, le résultat courant d'une autre couleur, et la popup affiche leur compte.
let found = { text: '', pane: -1, ranges: [], i: -1 };
api.on('ui:find', ({ pane, text, forward }) => {
  if (!text) {
    CSS.highlights.clear();
    found = { text: '', pane: -1, ranges: [], i: -1 };
    return;
  }
  if (text !== found.text || pane !== found.pane || !found.ranges.every((r) => r.startContainer.isConnected)) {
    const needle = text.toLowerCase();
    const ranges = [];
    const walker = document.createTreeWalker($('.screen', panesEl[pane]), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const hay = node.data.toLowerCase();
      for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
        const r = new Range();
        r.setStart(node, at);
        r.setEnd(node, at + needle.length);
        ranges.push(r);
      }
    }
    found = { text, pane, ranges, i: forward ? -1 : 0 };
    CSS.highlights.set('find', new Highlight(...ranges));
  }
  const n = found.ranges.length;
  if (n) {
    found.i = (found.i + (forward ? 1 : -1) + n) % n;
    const r = found.ranges[found.i];
    CSS.highlights.set('find-current', new Highlight(r));
    r.startContainer.parentElement.scrollIntoView({ block: 'center' });
  } else {
    CSS.highlights.delete('find-current');
  }
  api.findResult({ ordinal: n ? found.i + 1 : 0, matches: n });
});

panesEl.forEach((p, i) => p.addEventListener('pointerdown', () => state && state.activePane !== i && api.pane(i)));
