'use strict';

const ui = require('../window/ui');
const screens = require('../terminal/screens');

// Mode tty : la page en texte simple. Titres, paragraphes, listes et blocs de code ; chaque
// lien a un numéro (le même pour une même adresse). Les éléments cachés sont ignorés.
const TTY_SCRIPT = `(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'SELECT', 'BUTTON', 'INPUT', 'TEXTAREA', 'OBJECT', 'EMBED']);
  const BLOCK = new Set(['block', 'flex', 'grid', 'list-item', 'table', 'table-row', 'flow-root']);
  const blocks = [];
  const links = [];
  const seen = new Map();
  let cur = null;
  const flush = () => {
    if (cur) {
      if (cur.parts.length) {
        cur.parts[0].text = cur.parts[0].text.replace(/^\\s+/, '');
        const last = cur.parts[cur.parts.length - 1];
        last.text = last.text.replace(/\\s+$/, '');
      }
      if (cur.parts.some((p) => p.text.trim())) blocks.push(cur);
    }
    cur = null;
  };
  const add = (raw, link) => {
    let text = raw.replace(/\\s+/g, ' ');
    if (!text || (text === ' ' && !cur)) return;
    if (!cur) cur = { type: 'p', parts: [] };
    const last = cur.parts[cur.parts.length - 1];
    // « CopilotWrite » : deux morceaux de texte collés sans style, on les sépare.
    if (link && last && last.link === link && /[a-z0-9.]$/.test(last.text) && /^[A-Z]/.test(text)) text = ' ' + text;
    if (last && last.link === link) last.text += text;
    else cur.parts.push(link ? { text, link } : { text });
  };
  const walk = (node, link) => {
    for (const n of node.childNodes) {
      if (blocks.length > 3000) return;
      if (n.nodeType === 3) {
        add(n.textContent, link);
        continue;
      }
      if (n.nodeType !== 1 || SKIP.has(n.tagName.toUpperCase())) continue;
      const tag = n.tagName.toUpperCase();
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true') continue;
      if (tag === 'IMG') {
        if (link && n.alt && n.alt.trim()) add(n.alt.trim(), link);
        continue;
      }
      if (tag === 'BR') {
        flush();
        continue;
      }
      if (tag === 'PRE') {
        flush();
        if (n.innerText.trim()) blocks.push({ type: 'pre', parts: [{ text: n.innerText.replace(/\\s+$/, '') }] });
        continue;
      }
      if (tag === 'A' && !link && /^https?:/.test(n.href)) {
        const href = n.href;
        let k = seen.get(href);
        if (!k) {
          links.push(href);
          k = links.length;
          seen.set(href, k);
        }
        walk(n, k);
        continue;
      }
      const heading = /^H[1-6]$/.test(tag);
      const block = heading || tag === 'LI' || tag === 'P' || tag === 'TR' || BLOCK.has(cs.display);
      if (block && link) {
        // Bloc dans un lien : on reste dans le lien, séparé par une espace.
        add(' ', link);
        walk(n, link);
        add(' ', link);
        continue;
      }
      if (heading || tag === 'LI') {
        flush();
        cur = { type: heading ? 'h' : 'li', parts: [] };
        walk(n, link);
        flush();
        continue;
      }
      if (block) {
        flush();
        walk(n, link);
        flush();
        continue;
      }
      walk(n, link);
    }
  };
  walk(document.body || document.documentElement, 0);
  flush();
  return { title: document.title, blocks, links };
})()`;

function ttyLoading(url) {
  return { kind: 'tty', host: ui.hostOf(url), url, title: '', blocks: [], links: 0, loading: true };
}

async function showTty(tab, ready) {
  if (!tab.view) return;
  const wc = tab.view.webContents;
  if (!ready && wc.isLoading()) {
    screens.setScreen(tab, ttyLoading(tab.url), []);
    return; // dom-ready ou did-stop-loading rappelle showTty
  }
  try {
    const r = await wc.executeJavaScript(TTY_SCRIPT);
    if (!tab.tty) return;
    screens.setScreen(tab, { kind: 'tty', host: ui.hostOf(tab.url), url: tab.url, title: r.title, blocks: r.blocks, links: r.links.length }, r.links.map((url) => ({ kind: 'url', url })));
  } catch (err) {
    screens.setScreen(tab, { kind: 'tty', host: ui.hostOf(tab.url), url: tab.url, title: '', blocks: [], links: 0, error: err.message }, []);
  }
}

Object.assign(module.exports, { ttyLoading, showTty });
