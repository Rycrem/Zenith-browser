'use strict';

const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Deux façons de se mettre à jour :
// - appli installée (installateur des Releases GitHub) : electron-updater compare la version
//   installée avec la dernière Release, télécharge le nouvel installateur et l'applique ;
// - appli lancée depuis le code (npm start) : git pull + npm, via scripts/update.js.

const RELEASES_URL = 'https://github.com/Rycrem/dev-brows/releases/latest';
const win = process.platform === 'win32';
const appDir = app.getAppPath();
const reportFile = () => path.join(app.getPath('userData'), 'mise-a-jour.json');

let autoUpdater = null;
function releaseUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
  }
  return autoUpdater;
}

const installed = () => app.isPackaged;

function sh(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: appDir, shell: win, timeout: 30000 }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}

function major(v) {
  return Number(String(v).split('.')[0]);
}

// Appli installée : y a-t-il une Release GitHub plus récente que la version installée ?
async function checkRelease() {
  const result = await releaseUpdater().checkForUpdates();
  const latest = result && result.updateInfo ? result.updateInfo.version : app.getVersion();
  return { installed: true, current: app.getVersion(), latest, available: !!(result && result.isUpdateAvailable) };
}

// Code source : correctifs d'Electron dans la même version majeure, dernière majeure, commits en attente.
async function checkSource() {
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
  return { installed: false, current, sameMajor, latest, behind };
}

function check() {
  return installed() ? checkRelease() : checkSource();
}

// Appli installée : télécharge le nouvel installateur (onProgress reçoit un pourcentage) puis relance.
async function installRelease(onProgress) {
  const updater = releaseUpdater();
  const result = await updater.checkForUpdates();
  if (!result || !result.isUpdateAvailable) return false;
  const progress = (p) => onProgress(Math.round(p.percent));
  updater.on('download-progress', progress);
  try {
    await updater.downloadUpdate();
  } finally {
    updater.removeListener('download-progress', progress);
  }
  updater.quitAndInstall();
  return true;
}

// Code source : lance scripts/update.js avec le node du système puis ferme l'appli ; le script la relance.
function launchSource(mode) {
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

// Compte rendu de la dernière mise à jour depuis le code, affiché une fois au démarrage suivant.
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

module.exports = { check, installed, installRelease, launchSource, lastReport, major, RELEASES_URL };
