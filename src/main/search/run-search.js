'use strict';

const { net } = require('electron');
const C = require('../../shared/commands');
const { t, getLang } = require('../../shared/i18n');
const { parseDuckDuckGoHtml, parseNextPage, shortUrl } = require('../../shared/search');
const state = require('../state');
const hist = require('../history/history');
const navigation = require('../tabs/navigation');
const screens = require('../terminal/screens');

async function runSearch(tab, query, form) {
  const engine = state.settings.data.engine;
  if (!form) hist.addHistory({ url: `brows:${query}`, query, title: `brows « ${query} »` }, tab);
  if (engine !== 'ddg') {
    navigation.navigate(tab, C.ENGINES[engine].url(query));
    return [{ t: t('  page de résultats ouverte, tape « clicks » pour numéroter les liens'), c: 'dim' }];
  }
  let html;
  try {
    const res = form
      ? await net.fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
      })
      : await net.fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${getLang() === 'en' ? 'us-en' : 'fr-fr'}`);
    html = await res.text();
  } catch (err) {
    return [{ t: t('recherche impossible : {error}', { error: err.message }), c: 'err' }];
  }
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
