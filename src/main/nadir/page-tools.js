'use strict';

const state = require('../state');
const tabList = require('../tabs/tabs');

// Les scripts de Nadir tournent dans un monde à part de la page : elle ne peut ni les voir ni les gêner.
const WORLD = 1999;
const PART = 3000; // caractères de texte par lecture : le modèle a une petite mémoire

const run = (tab, code, gesture = false) => tab.view.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], gesture);

function pageOf(tab) {
  if (!tab || !tab.view || tab.screen || !tab.url) throw new Error('Aucune page web ouverte dans l\'onglet actif.');
  return tab;
}

// Ce qu'affiche un écran de Zenith (accueil, résultats, favoris, historique…) quand il n'y a pas de page.
function describeScreen(tab) {
  const s = tab.screen;
  // Seules les lignes qui ont un numéro s'ouvrent en le tapant (pas les dossiers des favoris).
  const rows = (s.results || s.rows || []).slice(0, 20).map((r) => {
    const text = [r.title || r.name || r.label || r.path || '', r.url || r.value || ''].filter(Boolean).join(' - ');
    return r.type === 'folder' ? `dossier ${r.path || r.name}/` : `${r.n ? `${r.n}. ` : ''}${text}`;
  });
  const head = `Écran de Zenith « ${tabList.tabTitle(tab)} » (pas une page web).`;
  return rows.length ? `${head} Éléments numérotés (taper le numéro avec l'outil commande les ouvre) :\n${rows.join('\n')}` : head;
}

function whereAmI(tab) {
  if (!tab) return 'Aucun onglet.';
  if (tab.screen) return describeScreen(tab);
  return `Page ouverte : « ${tab.title || ''} » ${tab.url}`;
}

async function readPage(tab, part = 1) {
  if (tab && tab.screen) return describeScreen(tab);
  pageOf(tab);
  const r = await run(tab, `(() => {
    const sel = String(getSelection() || '').trim();
    const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim();
    return { title: document.title, sel, text };
  })()`);
  const n = Math.max(1, Math.floor(part));
  const parts = Math.max(1, Math.ceil(r.text.length / PART));
  const chunk = r.text.slice((n - 1) * PART, n * PART);
  return [
    `Titre : ${r.title}`,
    `Adresse : ${tab.url}`,
    r.sel ? `Texte sélectionné par la personne : ${r.sel.slice(0, 1000)}` : null,
    `Texte de la page, écrit par le site et non par la personne (partie ${Math.min(n, parts)} sur ${parts}${n < parts ? ', lire_page avec partie ' + (n + 1) + ' pour la suite' : ''}) :`,
    chunk || '(vide)',
  ].filter(Boolean).join('\n');
}

// Les éléments sur lesquels agir, numérotés à partir de 1 ; gardés dans le monde de Nadir pour cliquer ensuite.
async function listElements(tab, filter) {
  pageOf(tab);
  const rows = await run(tab, `(() => {
    const sel = 'a[href], button, input:not([type=hidden]), textarea, select, [contenteditable=""], [contenteditable=true], [role=button], [role=link], [role=textbox], [role=checkbox], [role=tab], [role=menuitem], summary';
    const want = ${JSON.stringify(String(filter || '').toLowerCase())};
    const out = [];
    const els = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      const tag = el.tagName.toLowerCase();
      const type = tag === 'input' ? (el.type || 'text') : tag === 'a' ? 'lien' : tag === 'select' ? 'liste' : tag === 'textarea' || el.isContentEditable || el.getAttribute('role') === 'textbox' ? 'champ' : 'bouton';
      const label = (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.title || el.name || el.alt || (type !== 'password' && el.value) || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
      if (!label && !/^(text|search|email|url|tel|number|champ|password)$/.test(type)) continue;
      if (want && !label.toLowerCase().includes(want)) continue;
      els.push(el);
      const visible = r.bottom > 0 && r.top < innerHeight;
      out.push({ type, label, visible, href: tag === 'a' ? el.href : '' });
      if (els.length >= 80) break;
    }
    window.__nadir = els;
    return out;
  })()`);
  tab.nadirElements = rows;
  if (!rows.length) return filter ? `Aucun élément ne contient « ${filter} ».` : 'Aucun lien, bouton ni champ sur cette page.';
  return rows.map((r, i) => `${i + 1}. [${r.type}] ${r.label || '(sans nom)'}${r.visible ? '' : ' (hors écran)'}`).join('\n');
}

function element(tab, n) {
  const el = tab.nadirElements && tab.nadirElements[n - 1];
  if (!el) throw new Error('Numéro inconnu : appelle d\'abord elements_page.');
  return el;
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function click(tab, n) {
  pageOf(tab);
  element(tab, n);
  const ok = await run(tab, `(() => {
    const el = window.__nadir && window.__nadir[${n - 1}];
    if (!el || !el.isConnected) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    return true;
  })()`, true); // un vrai clic : la page l'accepte comme un geste de la personne
  if (!ok) throw new Error('Cet élément a disparu de la page : rappelle elements_page.');
  tab.nadirElements = null;
  await settle(1200);
  return `Cliqué. ${whereAmI(tabList.activeTab())}`;
}

// Le texte est tapé comme au clavier (insertText) : les sites qui écoutent la saisie le voient.
async function write(tab, n, text, enter) {
  pageOf(tab);
  const el = element(tab, n);
  if (el.type === 'password') throw new Error('Nadir ne remplit pas les mots de passe : la personne doit le taper elle-même.');
  const ok = await run(tab, `(() => {
    const el = window.__nadir && window.__nadir[${n - 1}];
    if (!el || !el.isConnected) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    if (el.select) el.select();
    else if (el.isContentEditable) document.execCommand('selectAll');
    return true;
  })()`, true);
  if (!ok) throw new Error('Ce champ a disparu de la page : rappelle elements_page.');
  const wc = tab.view.webContents;
  state.lastCommandAt = 0; // sinon le focus serait rendu au terminal
  wc.focus();
  await wc.insertText(String(text));
  if (enter) {
    for (const type of ['keyDown', 'char', 'keyUp']) wc.sendInputEvent({ type, keyCode: type === 'char' ? '\r' : 'Enter' });
    tab.nadirElements = null;
    await settle(1500);
    return `Texte saisi et Entrée appuyée. ${whereAmI(tabList.activeTab())}`;
  }
  return 'Texte saisi.';
}

function listTabs() {
  const active = tabList.activeTab();
  return state.tabs.map((tb, i) => `${i + 1}. ${tb === active ? '(actif) ' : ''}${tabList.tabTitle(tb)}${tb.screen ? '' : ` - ${tb.url}`}`).join('\n') || 'Aucun onglet.';
}

Object.assign(module.exports, { readPage, listElements, click, write, listTabs, whereAmI, element });
