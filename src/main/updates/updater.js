'use strict';

const { app, net } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const { t } = require('../../shared/i18n');
const path = require('path');

// Deux façons de se mettre à jour :
// - appli installée (installateur des Releases GitHub) : electron-updater compare la version
//   installée avec la dernière Release, télécharge le nouvel installateur et l'applique ;
// - appli lancée depuis le code (npm start) : git pull + npm, via scripts/update.js.

const RELEASES_URL = 'https://github.com/Rycrem/Zenith-browser/releases/latest';
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
  if (!latest) throw new Error(t('npm est introuvable ou hors ligne : impossible de vérifier'));
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
  // Titres des commits en attente, pour le récapitulatif.
  const log = behind ? await sh('git', ['log', '--no-merges', '--format=%s', '-n', '20', 'HEAD..@{u}']) : null;
  const commits = log ? log.split('\n').filter(Boolean) : [];
  return { installed: false, current, sameMajor, latest, behind, commits };
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

// Versions publiées sur GitHub, de la plus récente à la plus ancienne (sans les brouillons).
async function listReleases() {
  const res = await net.fetch('https://api.github.com/repos/Rycrem/Zenith-browser/releases?per_page=30', { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(t('GitHub ne répond pas ({status})', { status: res.status }));
  const list = await res.json();
  return list
    .filter((r) => !r.draft && /^v?\d+\.\d+\.\d+/.test(r.tag_name || ''))
    .map((r) => ({ version: r.tag_name.replace(/^v/, ''), date: r.published_at, body: r.body || '', url: r.html_url }));
}

// Installe une version précise (plus récente ou plus ancienne) : un updater à part, qui lit
// le latest.yml de cette Release, pour ne pas changer celui qui suit la dernière version.
async function installVersion(version, onProgress) {
  const eu = require('electron-updater');
  const options = { provider: 'generic', url: `https://github.com/Rycrem/Zenith-browser/releases/download/v${version}` };
  const Updater = win ? eu.NsisUpdater : process.env.APPIMAGE ? eu.AppImageUpdater : eu.DebUpdater;
  const updater = new Updater(options);
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = true;
  updater.logger = null;
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
  // Sans shell : un dossier dont le nom contient un espace ou un « & » ne devient pas une commande.
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(appDir, 'scripts', 'update.js'), appDir, String(process.pid), mode, reportFile()], {
      cwd: appDir,
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', () => reject(new Error(t('node est introuvable : mets à jour à la main avec « npm update »'))));
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

module.exports = { check, installed, installRelease, installVersion, listReleases, launchSource, lastReport, major, RELEASES_URL };
