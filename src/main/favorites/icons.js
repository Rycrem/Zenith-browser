'use strict';

const { session } = require('electron');
const fav = require('../../shared/favorites');
const state = require('../state');

// Logos des sites mis en favori, gardés par nom d'hôte (icones.json) : celui de l'onglet quand on
// visite le site, sinon /favicon.ico lu une fois en arrière-plan. Seulement pour les favoris.
const MAX_BYTES = 64 * 1024;
const asked = new Set(); // hôtes déjà demandés pendant cette session

const hostOf = (url) => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

const favoriteHosts = () => new Set(fav.allLinks(state.favorites.data.tree).map((l) => hostOf(l.url)).filter(Boolean));

// Appelé quand un onglet (hors navigation privée) a lu son logo.
function remember(url, data) {
  const host = hostOf(url);
  if (!host || !data || data.length > MAX_BYTES * 1.4 || !state.siteIcons) return;
  if (state.siteIcons.data.hosts[host] === data || !favoriteHosts().has(host)) return;
  state.siteIcons.data.hosts[host] = data;
  state.siteIcons.save();
  refresh();
}

async function fetchIcon(host) {
  try {
    const res = await session.defaultSession.fetch(`https://${host}/favicon.ico`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !/^image\//.test(type) || !buf.length || buf.length > MAX_BYTES) return '';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

// Logo d'un favori : data: URL, ou null (pas encore connu : on le cherche pour la prochaine fois).
function iconFor(url) {
  const host = hostOf(url);
  if (!host || !state.siteIcons) return null;
  const known = state.siteIcons.data.hosts[host];
  if (known !== undefined) return known || null;
  if (!asked.has(host)) {
    asked.add(host);
    fetchIcon(host).then((data) => {
      if (state.siteIcons.data.hosts[host]) return; // une visite l'a trouvé entre-temps
      state.siteIcons.data.hosts[host] = data;
      state.siteIcons.save();
      if (data) refresh();
    });
  }
  return null;
}

let timer = null;
function refresh() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    require('../panels/panels').sendPanel('fav');
    require('./favorites').refreshFavScreens();
  }, 300);
}

Object.assign(module.exports, { remember, iconFor });
