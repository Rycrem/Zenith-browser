'use strict';

const state = require('../state');
const ui = require('../window/ui');
const tabList = require('./tabs');

const MAX_BYTES = 200 * 1024;
const cache = new Map(); // adresse de l'icône → data: URL ('' si illisible), hors navigation privée

// L'icône est lue par le processus principal, avec la session de l'onglet, puis passée à
// l'interface en data: URL : l'interface ne charge rien depuis les sites.
async function readFavicon(tab, url) {
  if (url.startsWith('data:image/')) return url.length <= MAX_BYTES * 1.4 ? url : '';
  if (!/^https?:/.test(url)) return '';
  try {
    const res = await tabList.sesOf(tab).fetch(url);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !/^image\//.test(type) || buf.length > MAX_BYTES) return '';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function setFavicon(tab, url) {
  tab.faviconUrl = url;
  if (!url) return;
  let data = cache.get(url);
  if (data === undefined) {
    data = await readFavicon(tab, url);
    if (!tab.private && !state.privateMode) {
      if (cache.size > 300) cache.clear();
      cache.set(url, data);
    }
  }
  if (tab.faviconUrl !== url) return; // une autre page est arrivée entre-temps
  tab.favicon = data;
  ui.sendState();
}

// Nouvelle page : l'ancienne icône reste jusqu'à la fin du chargement (pas de clignotement
// d'une page à l'autre du même site), puis disparaît si la page n'en a pas annoncé.
function faviconNavigated(tab) {
  tab.faviconUrl = null;
}

function faviconLoaded(tab) {
  if (tab.faviconUrl === null && tab.favicon) {
    tab.favicon = null;
    ui.sendState();
  }
}

Object.assign(module.exports, { setFavicon, faviconNavigated, faviconLoaded });
