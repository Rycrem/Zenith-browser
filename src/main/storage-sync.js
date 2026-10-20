'use strict';

// Electron n'a pas chrome.storage.sync : chaque appel échoue (« "sync" is not available in
// this instance of Chrome »). Des extensions comme SponsorBlock y rangent leurs réglages et
// ne marchent plus du tout. On le remplace par chrome.storage.local, avec des clés préfixées,
// dans les trois contextes d'une extension :
// - service worker et pages (popup, options) : ext-sync-preload.js, préchargé ;
// - scripts de contenu : patchExtension() ajoute dev-brows-storage-sync.js en tête de leurs fichiers.
const fs = require('fs');
const path = require('path');

const { syncPolyfill } = require('./ext-sync-preload');

const FILE = 'dev-brows-storage-sync.js';

// Ajoute le remplaçant en tête des scripts de contenu (hors monde MAIN, qui n'a pas chrome.storage).
// Les ressources web_accessible_resources « use_dynamic_url » ont une adresse aléatoire
// qu'Electron ne sert pas : on les rend accessibles à leur adresse normale.
// Renvoie true si le manifeste a changé.
function patchExtension(dir) {
  const file = path.join(dir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  let changed = false;
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const needed = scripts.some((cs) => cs.world !== 'MAIN' && Array.isArray(cs.js) && cs.js.length);
  if (needed) {
    fs.writeFileSync(path.join(dir, FILE), `(${syncPolyfill})();\n`);
    for (const cs of scripts) {
      if (cs.world === 'MAIN' || !Array.isArray(cs.js) || !cs.js.length || cs.js.includes(FILE)) continue;
      cs.js.unshift(FILE);
      changed = true;
    }
  }
  if (Array.isArray(manifest.web_accessible_resources)) {
    for (const war of manifest.web_accessible_resources) {
      if (war && typeof war === 'object' && war.use_dynamic_url) {
        delete war.use_dynamic_url;
        changed = true;
      }
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return changed;
}

module.exports = { syncPolyfill, patchExtension, FILE };
