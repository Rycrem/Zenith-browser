'use strict';

// Notes de la version de package.json, tirées de src/shared/changelog.js, pour le texte de la
// Release GitHub : « update -v » les affiche dans la langue de l'appli.
// Usage : node scripts/release-notes.js > notes.md
const { version } = require('../package.json');
const { exactNotes } = require('../src/shared/changelog');

const fr = exactNotes(version, 'fr') || [];
const en = exactNotes(version, 'en') || [];
process.stdout.write(['### Français', '', ...fr.map((n) => `- ${n}`), '', '### English', '', ...en.map((n) => `- ${n}`), ''].join('\n'));
