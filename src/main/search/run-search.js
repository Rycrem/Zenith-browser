'use strict';

const { net } = require('electron');
const C = require('../../shared/commands');
const { t, getLang } = require('../../shared/i18n');
const { parseDuckDuckGoHtml, parseNextPage, shortUrl } = require('../../shared/search');
const state = require('../state');
const hist = require('../history/history');
const navigation = require('../tabs/navigation');
const screens = require('../terminal/screens');

// Sans réponse au bout de ce délai, on relance une fois avant d'abandonner.
const TIMEOUT_MS = 8000;
const ATTEMPTS = 2;

function fetchResults(query, form, signal) {
  const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) };
  if (form) {
    return net.fetch('https://html.duckduckgo.com/html/', {
      ...opts,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  }
  return net.fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${getLang() === 'en' ? 'us-en' : 'fr-fr'}`, opts);
}

async function runSearch(tab, query, form) {
  const engine = state.settings.data.engine;
  if (!form) hist.addHistory({ url: `brows:${query}`, query, title: `brows « ${query} »` }, tab);
  // Une nouvelle recherche annule la précédente : sa réponse tardive ne doit pas remplacer l'écran.
  if (tab.searchAbort) tab.searchAbort.abort();
  const ctrl = new AbortController();
  tab.searchAbort = ctrl;
  tab.searchSeq = (tab.searchSeq || 0) + 1;
  const seq = tab.searchSeq;
  const stale = () => tab.searchSeq !== seq;
  if (engine !== 'ddg') {
    navigation.navigate(tab, C.ENGINES[engine].url(query));
    return [{ t: t('  page de résultats ouverte, tape « clicks » pour numéroter les liens'), c: 'dim' }];
  }
  let html;
  for (let i = 1; html === undefined; i++) {
    try {
      html = await (await fetchResults(query, form, ctrl.signal)).text();
    } catch (err) {
      if (stale()) return [];
      if (i < ATTEMPTS) continue;
      if (tab.searchAbort === ctrl) tab.searchAbort = null;
      // Le serveur HTML de DuckDuckGo ne répond pas : la page normale passe souvent.
      navigation.navigate(tab, C.ENGINES.ddg.url(query));
      return [{ t: t('recherche impossible : {error}, page DuckDuckGo ouverte (tape « clicks »)', { error: err.name === 'TimeoutError' ? t('pas de réponse') : err.message }), c: 'warn' }];
    }
  }
  if (tab.searchAbort === ctrl) tab.searchAbort = null;
  if (stale()) return [];
  const results = parseDuckDuckGoHtml(html);
  if (!results.length) {
    // DuckDuckGo a pu demander une vérification : on affiche sa page telle quelle.
    navigation.navigate(tab, C.ENGINES.ddg.url(query));
    return [{ t: t('  aucun résultat lisible, page DuckDuckGo ouverte (tape « clicks »)'), c: 'warn' }];
  }
  const prev = form && tab.screen && tab.screen.kind === 'results' ? tab.screen : null;
  const page = prev ? prev.page + 1 : 1;
  const next = parseNextPage(html);
  screens.setScreen(
    tab,
    {
      kind: 'results',
      query,
      page,
      engine: C.ENGINES.ddg.label,
      results: results.map((r, i) => ({ n: i + 1, ...r, short: shortUrl(r.url) })),
      next,
      prev,
    },
    results.map((r) => ({ kind: 'url', url: r.url })),
  );
  return [{ t: t('  {count} résultats, page {page} · n page suivante · tape un numéro', { count: results.length, page }), c: 'dim' }];
}

Object.assign(module.exports, { runSearch });
