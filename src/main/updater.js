'use strict';

const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const win = process.platform === 'win32';
const appDir = app.getAppPath();
const reportFile = () => path.join(app.getPath('userData'), 'mise-a-jour.json');

function sh(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: appDir, shell: win, timeout: 30000 }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}

function major(v) {
  return Number(String(v).split('.')[0]);
}

// Compare la version installée d'Electron avec la dernière de la même version majeure
// (correctifs de sécurité, sans risque de casse) et la toute dernière.
async function check() {
  const current = process.versions.electron;
  const [sameMajorJson, latest] = await Promise.all([
    sh('npm', ['view', `electron@^${major(current)}`, 'version', '--json']),
    sh('npm', ['view', 'electron', 'version']),
  ]);
  if (!latest) throw new Error('npm est introuvable ou hors ligne : impossible de vérifier');
  let sameMajor = current;
  try {
    const list = [].concat(JSON.parse(sameMajorJson));
    sameMajor = list[list.length - 1] || current;
  } catch {
    // pas de version publiée dans cette série
  }
  let behind = null;
  if (fs.existsSync(path.join(appDir, '.git')) && (await sh('git', ['fetch', '--quiet'])) !== null) {
    const n = await sh('git', ['rev-list', '--count', 'HEAD..@{u}']);
    behind = n === null ? null : Number(n);
  }
  return { current, sameMajor, latest, behind, git: behind !== null };
}

// Lance scripts/update.js avec le node du système puis ferme l'appli ; le script la relance.
function launch(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(appDir, 'scripts', 'update.js'), appDir, String(process.pid), mode, reportFile()], {
      cwd: appDir,
      detached: true,
      stdio: 'ignore',
      shell: win,
    });
    child.once('error', () => reject(new Error('node est introuvable : mets à jour à la main avec « npm update »')));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

// Compte rendu de la dernière mise à jour, affiché une fois au démarrage suivant.
function lastReport() {
  const file = reportFile();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

module.exports = { check, launch, lastReport, major };
