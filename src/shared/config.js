'use strict';

// Fichier de configuration (« config export / import ») : les réglages et favoris d'un profil,
// pour le passer d'un ordinateur à l'autre. Les clés des IA n'y sont pas : chiffrées par le système,
// elles ne se relisent que sur l'ordinateur qui les a enregistrées.
const SETTINGS = ['engine', 'theme', 'mode', 'lang', 'aliases', 'volume', 'muteAll', 'permissions', 'autoUpdate', 'aiProvider', 'aiModels'];

function exportConfig({ settings, favorites, extensions, version }) {
  const picked = {};
  for (const k of SETTINGS) if (settings[k] !== undefined) picked[k] = settings[k];
  return { app: 'Zenith', format: 1, version, settings: picked, favorites, extensions };
}

// Un fichier de configuration vient d'ailleurs : chaque réglage garde la forme que Zenith attend,
// sinon il est ignoré (un favori sans nom ou une autorisation qui n'est pas oui/non feraient planter).
const str = (v) => typeof v === 'string' && v.length <= 4000;
const bool = (v) => typeof v === 'boolean';
function map(v, ok) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (k !== '__proto__' && ok(x)) out[k] = x;
  return out;
}
const CHECKS = {
  engine: (v) => (str(v) ? v : undefined),
  theme: (v) => (str(v) ? v : undefined),
  mode: (v) => (v === 'jour' || v === 'nuit' ? v : undefined),
  lang: (v) => (v === 'fr' || v === 'en' ? v : undefined),
  aliases: (v) => map(v, (x) => str(x) && !!x.trim()),
  volume: (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined),
  muteAll: (v) => (bool(v) ? v : undefined),
  permissions: (v) => map(v, (p) => !!map(p, bool) && Object.values(p).every(bool)),
  autoUpdate: (v) => (bool(v) ? v : undefined),
  aiProvider: (v) => (str(v) ? v : undefined),
  aiModels: (v) => map(v, str),
};

const LINK_URL = /^(https?|ftp|file):/i;
function cleanFavorite(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'folder' && str(node.name) && Array.isArray(node.children)) {
    return { type: 'folder', name: node.name, children: node.children.map(cleanFavorite).filter(Boolean), ...(node.manual === true ? { manual: true } : {}) };
  }
  if (node.type !== 'link' || !str(node.url) || !LINK_URL.test(node.url)) return null;
  const name = str(node.name) && node.name.trim() ? node.name : node.url;
  return { type: 'link', name, url: node.url, title: str(node.title) ? node.title : name, addedAt: Number.isFinite(node.addedAt) ? node.addedAt : 0 };
}

// Renvoie { settings, favorites, extensions } ; lève une erreur si ce n'est pas un fichier de configuration.
function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  if (!data || data.format !== 1 || typeof data.settings !== 'object' || !data.settings) throw new Error('format');
  const settings = {};
  for (const k of SETTINGS) {
    const v = data.settings[k] === undefined ? undefined : CHECKS[k](data.settings[k]);
    if (v !== undefined) settings[k] = v;
  }
  const favorites = data.favorites && data.favorites.type === 'folder' ? cleanFavorite({ ...data.favorites, name: '' }) : null;
  const extensions = (Array.isArray(data.extensions) ? data.extensions : [])
    .filter((e) => e && /^([a-p]{32}|ublock)$/.test(e.source))
    .map((e) => ({ source: e.source, alias: str(e.alias) && /^[\w-]{1,12}$/.test(e.alias) ? e.alias : undefined, enabled: e.enabled !== false, pinned: e.pinned !== false }));
  return { settings, favorites, extensions };
}

module.exports = { exportConfig, parseConfig, SETTINGS };
