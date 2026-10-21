'use strict';

// Journal de Zenith : zenith.log dans le dossier de données. On y note le lancement,
// le chargement de chaque extension et tout plantage (main, page, processus enfant), pour
// savoir pourquoi l'appli s'est fermée. Au-delà de 1 Mo, l'ancien journal devient zenith.old.log.
const fs = require('fs');
const path = require('path');

const MAX = 1024 * 1024;
let file = null;

function open(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'zenith.log');
  try {
    if (fs.statSync(file).size > MAX) fs.renameSync(file, path.join(dir, 'zenith.old.log'));
  } catch {}
  return file;
}

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  if (!file) return process.stderr.write(line);
  try {
    fs.appendFileSync(file, line); // synchrone : la ligne est écrite même si l'appli plante juste après
  } catch {}
}

// Lancement en cours : un fichier témoin effacé une fois l'appli stable. S'il est encore là au
// lancement suivant, le précédent a planté pendant le démarrage. Renvoie alors son contenu
// (l'étape où il s'est arrêté), sinon null.
function startupGuard(dir) {
  const marker = path.join(dir, 'launching');
  let previous = null;
  try {
    previous = fs.readFileSync(marker, 'utf8') || 'démarrage';
  } catch {}
  const step = (what) => {
    try {
      fs.writeFileSync(marker, what);
    } catch {}
  };
  const done = () => fs.rmSync(marker, { force: true });
  step('démarrage');
  return { previous, step, done };
}

module.exports = { open, log, startupGuard };
