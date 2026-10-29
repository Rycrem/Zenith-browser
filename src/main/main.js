'use strict';

const { app, session, nativeTheme, crashReporter } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('./storage/store');
const journal = require('./storage/log');
const { Extensions } = require('./extensions/extensions');
const ai = require('./ai/providers');
const fav = require('../shared/favorites');
const { t, setLang } = require('../shared/i18n');
const state = require('./state');
const googleLogin = require('./security/google-login');
const theme = require('./window/theme');
const tabList = require('./tabs/tabs');
const chromeApis = require('./extensions/chrome-api');
const output = require('./terminal/output');
const dl = require('./downloads/downloads');
const extLogs = require('./extensions/logs');
const defaultBrowser = require('./commands/default-browser');
const lang = require('./commands/lang');
const webauthn = require('./security/webauthn');
const permissions = require('./security/permissions');
const menu = require('./window/menu');
const ipc = require('./window/ipc');
const mainWindow = require('./window/window');

// Les données de l'ancien nom (dev-brows) passent dans le dossier Zenith au premier lancement.
// Un dossier Zenith sans réglages (créé vide par Electron) ne compte pas. Si le déplacement
// échoue (fichier encore ouvert), l'appli reste sur l'ancien dossier cette fois-ci.
function dataDir(name, old) {
  const dir = path.join(app.getPath('appData'), name);
  const prev = path.join(app.getPath('appData'), old);
  const ours = (d) => fs.existsSync(path.join(d, 'reglages.json'));
  if (ours(dir) || !ours(prev)) return dir;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(prev, dir);
    return dir;
  } catch {
    return prev;
  }
}

// Lancée depuis le code, l'appli garde ses données à part : la version installée chiffre
// ses cookies (fuse Electron), et un Electron sans ce réglage ne saurait plus les lire.
app.setPath('userData', dataDir('Zenith', 'dev-brows'));
if (!app.isPackaged) {
  const shared = app.getPath('userData');
  const dev = dataDir('Zenith-dev', 'dev-brows-dev');
  // Les données créées avant cette séparation suivent la version lancée depuis le code.
  if (fs.existsSync(shared) && !fs.existsSync(dev)) fs.cpSync(shared, dev, { recursive: true });
  app.setPath('userData', dev);
}

// Sans les mentions Electron et du nom de l'appli, les sites voient un Chrome ordinaire.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/\S+/, '')
  .replace(/ (dev-brows|Zenith)\/\S+/, '');

// Journal (zenith.log dans le dossier de données) : lancement, extensions, plantages.
journal.open(app.getPath('userData'));
journal.log(`lancement de Zenith ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform} ${os.release()})`);
// Une seule fenêtre Zenith : un second lancement (lien ouvert depuis une autre appli) passe ses adresses
// à la première et s'arrête là, sans toucher aux témoins de la session en cours (sinon elle passait pour plantée).
if (!app.requestSingleInstanceLock()) {
  journal.log('Zenith est déjà ouvert : adresses passées à la fenêtre ouverte');
  app.exit(0);
}
app.on('second-instance', (e, argv) => defaultBrowser.openExternalUrls(argv));
// Un plantage du processus principal ne passe par aucun code JavaScript : seul un rapport de
// plantage (gardé sur le disque, jamais envoyé) et le témoin de session en laissent une trace.
app.setPath('crashDumps', path.join(app.getPath('userData'), 'Crashpad'));
crashReporter.start({ uploadToServer: false });
const session_ = journal.sessionGuard(app.getPath('userData'));
if (session_.previous) {
  const dumps = journal.dumpsSince(app.getPath('crashDumps'), session_.previous);
  journal.log(`la session commencée à ${session_.previous} s'est arrêtée sans fermeture normale${dumps.length ? ` ; rapport de plantage : ${dumps[0]}` : ' (pas de rapport de plantage : fin de tâche, coupure ou blocage)'}`);
}
process.on('uncaughtException', (err) => journal.log('erreur non rattrapée :', err));
process.on('unhandledRejection', (err) => journal.log('promesse rejetée non rattrapée :', err instanceof Error ? err : String(err)));
app.on('render-process-gone', (e, wc, d) => {
  journal.log(`page arrêtée (${d.reason}, code ${d.exitCode}) : ${wc && !wc.isDestroyed() ? wc.getURL() : '?'}`);
  // L'interface (onglets, terminal) s'est arrêtée : on la recharge plutôt que de laisser une fenêtre vide.
  const w = state.allWindows().find((x) => x.win && !x.win.isDestroyed() && x.win.webContents === wc);
  if (w && d.reason !== 'clean-exit') setTimeout(() => w.win && !w.win.isDestroyed() && w.win.webContents.reload(), 500);
});
app.on('child-process-gone', (e, d) => journal.log(`processus ${d.type}${d.name ? ` (${d.name})` : ''} arrêté : ${d.reason}, code ${d.exitCode}`));
const guard = journal.startupGuard(app.getPath('userData'));

app.whenReady().then(async () => {
  state.ses = session.defaultSession;
  const dir = app.getPath('userData');
  state.favorites = new JsonStore(path.join(dir, 'favoris.json'), { tree: fav.emptyTree() });
  state.history = new JsonStore(path.join(dir, 'historique.json'), { entries: [] });
  state.sessionStore = new JsonStore(path.join(dir, 'session.json'), { tabs: [] });
  state.previousSession = state.sessionStore.data.tabs.slice();
  state.settings = new JsonStore(path.join(dir, 'reglages.json'), { engine: 'ddg', theme: 'ambre', aliases: {}, extensions: [] });
  state.nadirChats = new JsonStore(path.join(dir, 'nadir-discussions.json'), { list: [] });
  // Plus rien d'enregistré pour ce qui a disparu : le bloqueur de secours, la date de la dernière vérification.
  for (const k of ['builtinAdblock', 'lastUpdateCheck']) delete state.settings.data[k];
  fs.rmSync(path.join(dir, 'adblock.bin'), { force: true });
  ai.migrate(state.settings);
  nativeTheme.themeSource = theme.isLight() ? 'light' : 'dark';
  setLang(lang.initialLang());
  state.chromeApi = chromeApis.setupChromeApi(state.ses); // avant le chargement des extensions, pour lire leurs manifestes
  extLogs.watchExtensionLogs();
  state.ses.registerPreloadScript({ id: 'dev-brows-browser-alias', type: 'frame', filePath: path.join(__dirname, 'extensions', 'ext-preload.js') });
  state.ses.registerPreloadScript({ id: 'dev-brows-sw-events', type: 'service-worker', filePath: path.join(__dirname, 'extensions', 'ext-sw-preload.js') });
  for (const type of ['frame', 'service-worker']) state.ses.registerPreloadScript({ id: `dev-brows-storage-sync-${type}`, type, filePath: path.join(__dirname, 'extensions', 'ext-sync-preload.js') });
  state.exts = new Extensions(state.ses, state.settings, path.join(dir, 'extensions'));
  state.exts.installBundledUblock(app.isPackaged ? path.join(process.resourcesPath, 'ublock-origin') : path.join(__dirname, '..', '..', 'vendor', 'ublock-origin'));
  // Le lancement précédent a planté avant d'être stable : on désactive l'extension qui se
  // chargeait à ce moment-là, ou, si on ne sait pas, toutes les extensions pour ce lancement.
  let safeNote = null;
  if (guard.previous) {
    journal.log(`le lancement précédent s'est arrêté pendant : ${guard.previous}`);
    const culprit = guard.previous.startsWith('extension ') && state.exts.list.find((e) => e.path === guard.previous.slice(10));
    if (culprit) {
      culprit.enabled = false;
      state.settings.save();
      safeNote = t('  ⚠ Zenith a planté au dernier lancement en chargeant l\'extension {name} : elle est désactivée (« ext on » pour la réactiver). Détails : {file}', { name: culprit.name || culprit.alias, file: path.join(dir, 'zenith.log') });
    } else if (state.exts.list.some((e) => e.enabled)) {
      // Cause inconnue : on coupe les extensions (« ext on n » une par une retrouve la fautive).
      for (const e of state.exts.list) e.enabled = false;
      state.settings.save();
      safeNote = t('  ⚠ Zenith a planté au dernier lancement : les extensions sont désactivées, « ext on <n> » les réactive une par une. Détails : {file}', { file: path.join(dir, 'zenith.log') });
    }
  }
  const cleared = state.exts.checkStorage(dir, journal.log);
  const storageNote = cleared.length ? t('  ⚠ Le stockage de {names} dépassait 512 Mo, ce qui fait planter Zenith : il a été vidé. L\'extension repart de ses réglages par défaut.', { names: cleared.map((c) => c.name).join(', ') }) : null;
  await state.exts.loadAll({
    before: (ext) => {
      guard.step(`extension ${ext.path}`);
      journal.log(`chargement de l'extension ${ext.name || ext.alias || ext.path}`);
    },
    after: (ext) => journal.log(ext.error ? `  échec : ${ext.error}` : `  chargée (${ext.id})`),
  });
  guard.step('ouverture de la fenêtre');
  ipc.setupIpc();
  dl.setupDownloads();
  permissions.setupPermissions();
  webauthn.setupWebAuthn();
  googleLogin.setupGoogleLogin();
  menu.buildMenu();
  mainWindow.createWindow();
  const startUrls = defaultBrowser.urlsIn(process.argv.slice(1));
  if (startUrls.length) for (const url of startUrls) tabList.createTab({ url });
  else tabList.createTab();
  guard.step('en marche');
  const notes = [safeNote, storageNote].filter(Boolean).map((n) => ({ t: n, c: 'warn' }));
  if (notes.length) state.win.webContents.once('did-finish-load', () => setTimeout(() => output.print(notes), 500));
  // Stable après 20 s : un plantage plus tard ne viendra pas du démarrage.
  setTimeout(() => {
    guard.done();
    journal.log('démarrage terminé');
  }, 20000);
});

function closeNormally() {
  guard.done(); // fermeture normale, même avant la fin du démarrage
  session_.done();
  for (const s of [state.favorites, state.history, state.settings, state.sessionStore, state.nadirChats]) if (s) s.flush();
}
app.on('before-quit', closeNormally);
// Arrêt ou déconnexion de Windows : l'appli est tuée sans before-quit, seul session-end prévient.
app.on('browser-window-created', (e, w) => w.on('session-end', () => {
  journal.log('arrêt de Windows : fermeture');
  closeNormally();
}));

app.on('window-all-closed', () => app.quit());
