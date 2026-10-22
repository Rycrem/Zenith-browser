'use strict';

const { dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bookmarks = require('../../shared/bookmarks-import');
const { t } = require('../../shared/i18n');
const state = require('../state');
const favs = require('./favorites');
const questions = require('../terminal/questions');

// Navigateurs connus : dossier des profils selon le système (Chromium : un fichier Bookmarks par profil).
const BROWSERS = [
  { id: 'chrome', name: 'Chrome', kind: 'chromium', win: ['local', 'Google/Chrome/User Data'], mac: 'Google/Chrome', linux: 'google-chrome' },
  { id: 'edge', name: 'Edge', kind: 'chromium', win: ['local', 'Microsoft/Edge/User Data'], mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  { id: 'brave', name: 'Brave', kind: 'chromium', win: ['local', 'BraveSoftware/Brave-Browser/User Data'], mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser' },
  { id: 'vivaldi', name: 'Vivaldi', kind: 'chromium', win: ['local', 'Vivaldi/User Data'], mac: 'Vivaldi', linux: 'vivaldi' },
  { id: 'opera', name: 'Opera', kind: 'chromium', win: ['roaming', 'Opera Software/Opera Stable'], mac: 'com.operasoftware.Opera', linux: 'opera' },
  { id: 'chromium', name: 'Chromium', kind: 'chromium', win: ['local', 'Chromium/User Data'], mac: 'Chromium', linux: 'chromium' },
  { id: 'firefox', name: 'Firefox', kind: 'firefox', win: ['roaming', 'Mozilla/Firefox/Profiles'], mac: 'Firefox/Profiles', linux: '../.mozilla/firefox' },
];

function browserDirs(b) {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const base = b.win[0] === 'local' ? process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local') : process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(base, b.win[1])];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Application Support', b.mac)];
  const dirs = [path.join(home, '.config', b.linux)];
  if (b.id === 'firefox') dirs.push(path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'));
  return dirs;
}

const readDir = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

// Liste les profils trouvés sur cet ordinateur : { id, label, kind, file }.
function browserSources() {
  const out = [];
  for (const b of BROWSERS) {
    for (const dir of browserDirs(b)) {
      if (b.kind === 'chromium') {
        let names = {};
        try {
          names = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8')).profile.info_cache || {};
        } catch {}
        const profiles = [{ dir, profile: '' }, ...readDir(dir).filter((d) => d.isDirectory()).map((d) => ({ dir: path.join(dir, d.name), profile: d.name }))];
        for (const p of profiles) {
          const file = path.join(p.dir, 'Bookmarks');
          if (!fs.existsSync(file)) continue;
          const who = p.profile && ((names[p.profile] && names[p.profile].name) || p.profile);
          out.push({ id: b.id, name: b.name, label: who ? `${b.name} (${who})` : b.name, kind: 'chromium', file });
        }
      } else {
        for (const d of readDir(dir).filter((x) => x.isDirectory())) {
          const backups = path.join(dir, d.name, 'bookmarkbackups');
          const files = readDir(backups).filter((f) => /\.jsonlz4$/.test(f.name)).map((f) => path.join(backups, f.name));
          if (!files.length) continue;
          const file = files.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
          const who = d.name.replace(/^[^.]*\./, '');
          out.push({ id: b.id, name: b.name, label: `${b.name} (${who})`, kind: 'firefox', file });
        }
      }
    }
  }
  return out;
}

function readBookmarks(source) {
  const file = source.file;
  if (source.kind === 'chromium' || /\.json$/i.test(file)) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return json.roots ? bookmarks.fromChromium(json) : bookmarks.fromFirefox(json);
  }
  if (source.kind === 'firefox' || /\.jsonlz4$/i.test(file)) return bookmarks.fromFirefox(JSON.parse(bookmarks.mozLz4(fs.readFileSync(file)).toString('utf8')));
  return bookmarks.fromHtml(fs.readFileSync(file, 'utf8'));
}

function importFrom(tab, source, say) {
  let nodes;
  try {
    nodes = readBookmarks(source);
  } catch (err) {
    throw new Error(t('impossible de lire les favoris de {name} : {error}', { name: source.label, error: err.message }));
  }
  const folder = source.name;
  const r = bookmarks.mergeInto(state.favorites.data.tree, folder, nodes);
  if (!r.added) return say(t('  rien de nouveau dans {name} ({skipped} déjà dans tes favoris)', { name: source.label, skipped: r.skipped }), 'dim');
  favs.saveFavorites();
  const done = r.added === 1 ? t('  ✓ 1 favori importé de {name} dans {folder}/', { name: source.label, folder }) : t('  ✓ {count} favoris importés de {name} dans {folder}/', { count: r.added, name: source.label, folder });
  say(done + (r.skipped ? t(' ({skipped} déjà là)', { skipped: r.skipped }) : ''), 'ok');
  favs.showFav(tab, folder);
}

// fav import : choisir un navigateur trouvé ; fav import chrome ; fav import <fichier.html> ; fav import fichier.
async function importCommand(tab, arg, say) {
  const file = arg.replace(/^~(?=$|[\\/])/, os.homedir()).replace(/^"(.*)"$/, '$1');
  if (/^(fichier|file)$/i.test(arg)) {
    const r = await dialog.showOpenDialog(state.win, {
      title: t('Favoris exportés d\'un autre navigateur'),
      properties: ['openFile'],
      filters: [{ name: t('Favoris'), extensions: ['html', 'htm', 'json', 'jsonlz4'] }],
    });
    if (r.canceled || !r.filePaths.length) return say(t('  annulé'), 'dim');
    return importFrom(tab, { label: path.basename(r.filePaths[0]), name: t('importés'), kind: 'file', file: r.filePaths[0] }, say);
  }
  if (file && /[\\/.]/.test(file)) {
    if (!fs.existsSync(file)) throw new Error(t('fichier introuvable : {file}', { file }));
    return importFrom(tab, { label: path.basename(file), name: t('importés'), kind: 'file', file }, say);
  }
  let sources = browserSources();
  if (arg) {
    sources = sources.filter((x) => x.id === arg.toLowerCase());
    if (!sources.length) throw new Error(t('pas de favoris {name} trouvés sur cet ordinateur (« fav import » pour la liste)', { name: arg }));
  }
  if (sources.length === 1) return importFrom(tab, sources[0], say);
  if (!sources.length) {
    say(t('  aucun navigateur trouvé sur cet ordinateur'), 'dim');
    return say(t('  exporte tes favoris en HTML depuis l\'autre navigateur, puis « fav import fichier »'), 'dim');
  }
  say(t('  favoris trouvés sur cet ordinateur :'), 'dim');
  sources.forEach((x, i) => say(`  [${i + 1}] ${x.label}`));
  say(t('  ou « fav import fichier » pour un export HTML'), 'dim');
  const question = t('importer lesquels ? numéro (1-{max}), ou Entrée pour annuler', { max: sources.length });
  for (const l of questions.enqueue(question, async (input, s) => {
    const x = sources[Number(input) - 1];
    if (!input || !x) return s(t('  annulé'), 'dim');
    importFrom(tab, x, s);
  }, /^\d*$/)) say(l.t, l.c);
}

Object.assign(module.exports, { importCommand });
