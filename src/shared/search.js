'use strict';

// Lecture des résultats de la version HTML de DuckDuckGo (html.duckduckgo.com).

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€', middot: '·',
  agrave: 'à', acirc: 'â', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï',
  ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü', ccedil: 'ç', oelig: 'œ', Eacute: 'É', Agrave: 'À',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (ENTITIES[e] !== undefined) return ENTITIES[e];
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// Les liens passent par //duckduckgo.com/l/?uddg=<url encodée> : on récupère la vraie adresse.
function realUrl(href) {
  const h = decodeEntities(href);
  const m = h.match(/[?&]uddg=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  if (h.startsWith('//')) return `https:${h}`;
  return h;
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  // Chaque résultat est un bloc <div class="result ..."> ; on ignore les annonces.
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const block of blocks) {
    const head = block.slice(0, 200);
    if (/result--ad/.test(head)) continue;
    const a = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = realUrl(a[1]);
    if (!/^https?:/i.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    const snip = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|td)>/i);
    results.push({ title: stripTags(a[2]), url, desc: snip ? stripTags(snip[1]) : '' });
  }
  return results;
}

// Les paramètres du formulaire « page suivante », s'il existe.
function parseNextPage(html) {
  const forms = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || [];
  for (const form of forms) {
    if (!/nav-link|value="(Next|Suivant)/i.test(form)) continue;
    const params = {};
    const inputs = form.match(/<input[^>]+>/gi) || [];
    for (const input of inputs) {
      const name = input.match(/name="([^"]+)"/);
      const value = input.match(/value="([^"]*)"/);
      if (name && !/type="submit"/i.test(input)) params[name[1]] = decodeEntities(value ? value[1] : '');
    }
    if (params.s !== undefined) return params;
  }
  return null;
}

function shortUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

module.exports = { parseDuckDuckGoHtml, parseNextPage, decodeEntities, stripTags, shortUrl };
