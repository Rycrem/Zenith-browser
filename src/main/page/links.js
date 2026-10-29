'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');
const theme = require('../window/theme');

// Les scripts tournent dans un monde à part : la page ne peut pas fausser ce qu'ils lisent.
const WORLD = 1998;
const run = (wc, code, gesture = false) => wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], gesture);

const LINKS_SCRIPT = `(() => {
  document.querySelectorAll('.__devbrows_hint').forEach((e) => e.remove());
  const sel = 'a[href], button, input:not([type=hidden]), textarea, select, [contenteditable=""], [contenteditable=true], [role=button], [role=link], [role=textbox], summary';
  const vw = innerWidth, vh = innerHeight, els = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    els.push(el);
    if (els.length >= 300) break;
  }
  window.__devBrows = els;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const h = document.createElement('span');
    h.className = '__devbrows_hint';
    h.textContent = i + 1;
    h.style.cssText = 'position:absolute;z-index:2147483647;pointer-events:none;left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;background:__ACCENT__;color:#0E1116;font:bold 11px/1.4 monospace;padding:0 4px;border-radius:3px;transform:translate(-70%,-45%);box-shadow:0 1px 3px rgba(0,0,0,.4)';
    document.documentElement.appendChild(h);
  });
  return els.map((el) => ({ href: el.href || null, text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 80) }));
})()`;

async function numberLinks(tab) {
  if (!tab.view || tab.screen) throw new Error(t('aucune page ouverte'));
  const accent = theme.accentColor();
  const links = await run(tab.view.webContents, LINKS_SCRIPT.replace('__ACCENT__', accent));
  tab.numbered = links.map((l, i) => ({ kind: 'link', i, href: l.href }));
  tab.numberedKind = 'links';
  return links.length;
}

// Un champ de saisie reçoit le curseur (et le clavier passe à la page) ; le reste est cliqué.
async function clickLink(tab, i) {
  const wc = tab.view.webContents;
  const r = await run(wc, `(() => {
    const el = window.__devBrows && window.__devBrows[${i}];
    document.querySelectorAll('.__devbrows_hint').forEach((e) => e.remove());
    if (!el) return false;
    const field = el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.getAttribute('role') === 'textbox'
      || (el.tagName === 'INPUT' && !/^(submit|button|reset|checkbox|radio|file|image|range|color)$/i.test(el.type));
    el.focus();
    if (field) return 'field';
    el.click();
    return true;
  })()`, true); // true : compte comme un vrai clic, pour que « back » puisse revenir
  if (r === 'field') {
    state.lastCommandAt = 0; // sinon le focus de la page serait rendu au terminal
    wc.focus();
    await run(wc, `window.__devBrows[${i}] && window.__devBrows[${i}].focus()`).catch(() => {});
  }
  return r;
}

Object.assign(module.exports, { numberLinks, clickLink, WORLD });
