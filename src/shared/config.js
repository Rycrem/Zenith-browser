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
  for (const k of SETTINGS) if (data.settings[k] !== undefined) settings[k] = data.settings[k];
  const favorites = data.favorites && data.favorites.type === 'folder' && Array.isArray(data.favorites.children) ? data.favorites : null;
  const extensions = (Array.isArray(data.extensions) ? data.extensions : [])
    .filter((e) => e && /^([a-p]{32}|ublock)$/.test(e.source))
    .map((e) => ({ source: e.source, alias: typeof e.alias === 'string' ? e.alias : undefined, enabled: e.enabled !== false, pinned: e.pinned !== false }));
  return { settings, favorites, extensions };
}

module.exports = { exportConfig, parseConfig, SETTINGS };
