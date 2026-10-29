'use strict';

// Côté main des API ajoutées par ext-api-preload.js : on les déclare sur le routeur
// d'electron-chrome-extensions, qui vérifie déjà que l'appel vient d'une extension chargée.
// Chaque API demande, comme dans Chrome, la permission déclarée dans le manifeste de l'extension.
// `host` relie ces API aux données de dev-brows (onglet affiché, historique, favoris…).
const { BrowserWindow } = require('electron');

const extensionInfo = (ext, enabled = true) => {
  const m = ext.manifest || {};
  return {
    id: ext.id,
    name: ext.name || m.name || '',
    shortName: m.short_name || ext.name || '',
    description: m.description || '',
    version: ext.version || m.version || '',
    enabled,
    mayDisable: true,
    installType: 'normal',
    type: 'extension',
    isApp: false,
    offlineEnabled: false,
    homepageUrl: m.homepage_url || '',
    optionsUrl: m.options_page || (m.options_ui && m.options_ui.page) ? `${ext.url}${m.options_page || m.options_ui.page}` : '',
    permissions: (m.permissions || []).filter((p) => typeof p === 'string' && !p.includes('://')),
    hostPermissions: m.host_permissions || [],
    icons: Object.entries(m.icons || {}).map(([size, p]) => ({ size: Number(size), url: `${ext.url}${p}` })),
  };
};

// Arbre des favoris de dev-brows au format de chrome.bookmarks. Les identifiants suivent
// l'ordre de l'arbre : 0 la racine, 1 le dossier « Favoris » qui contient tout le reste.
function bookmarkTree(tree) {
  let next = 2;
  const nodes = new Map();
  const conv = (node, parentId, index) => {
    const id = String(next++);
    const out = { id, parentId, index, title: node.name || node.title || '', dateAdded: node.addedAt || 0, syncing: false };
    if (node.type === 'folder') out.children = (node.children || []).map((c, i) => conv(c, id, i));
    else out.url = node.url;
    nodes.set(id, out);
    return out;
  };
  const bar = { id: '1', parentId: '0', index: 0, title: 'Favoris', dateAdded: 0, syncing: false, folderType: 'bookmarks-bar' };
  bar.children = ((tree && tree.children) || []).map((c, i) => conv(c, '1', i));
  const root = { id: '0', title: '', dateAdded: 0, syncing: false, children: [bar] };
  nodes.set('0', root).set('1', bar);
  return { root, nodes };
}

// Copie sans les enfants, comme bookmarks.get et getChildren.
const shallow = ({ children, ...node }) => node;

// Permissions du manifeste (les facultatives sont accordées d'office par electron-chrome-extensions).
function hasPermission(ext, ...wanted) {
  const m = (ext && ext.manifest) || {};
  const all = [...(m.permissions || []), ...(m.optional_permissions || []), ...(m.host_permissions || [])];
  return wanted.some((p) => all.includes(p));
}

function registerExtraApis(api, host) {
  const route = api.ctx.router.apiHandler();
  // Le nom de l'API donne sa permission (devbrows.history.search → history) ; need la remplace.
  const handle = (name, fn, need) => route(name, (event, ...args) => {
    const wanted = need || [name.split('.')[1]];
    if (!hasPermission(event.extension, ...wanted)) throw new Error(`${name.replace('devbrows.', '')} requires the ${wanted.join(' or ')} permission`);
    return fn(event, ...args);
  });
  const session = api.ctx.session;
  const extensions = () => (session.extensions || session).getAllExtensions();

  handle('devbrows.tabs.captureVisibleTab', async (event, windowId, options) => {
    const opts = (windowId && typeof windowId === 'object' ? windowId : options) || {};
    const wc = host.activeContents();
    if (!wc || wc.isDestroyed()) throw new Error('No active tab');
    const image = await wc.capturePage();
    if (opts.format === 'png') return image.toDataURL();
    const quality = Number.isFinite(opts.quality) ? opts.quality : 92;
    return `data:image/jpeg;base64,${image.toJPEG(quality).toString('base64')}`;
  }, ['<all_urls>', 'activeTab']);

  handle('devbrows.search.query', (event, info = {}) => {
    if (!info.text) throw new Error('Missing text');
    host.search(String(info.text), info.disposition === 'CURRENT_TAB' && !info.tabId);
  });

  route('devbrows.management.getSelf', (event) => extensionInfo(event.extension));
  handle('devbrows.management.getAll', () => extensions().map((e) => extensionInfo(e)));
  handle('devbrows.management.get', (event, id) => {
    const ext = extensions().find((e) => e.id === id);
    if (!ext) throw new Error(`Failed to find extension with id ${id}.`);
    return extensionInfo(ext);
  });

  handle('devbrows.history.search', (event, query = {}) => {
    const text = String(query.text || '').toLowerCase();
    const start = Number.isFinite(query.startTime) ? query.startTime : Date.now() - 24 * 3600 * 1000;
    const end = Number.isFinite(query.endTime) ? query.endTime : Infinity;
    const max = Number.isFinite(query.maxResults) ? query.maxResults : 100;
    const byUrl = new Map();
    const entries = host.history();
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!e.url || e.query || !/^https?:/.test(e.url)) continue;
      const time = e.time || 0;
      let item = byUrl.get(e.url);
      if (!item) {
        if (time < start || time > end) continue;
        if (text && !e.url.toLowerCase().includes(text) && !String(e.title || '').toLowerCase().includes(text)) continue;
        byUrl.set(e.url, (item = { id: String(byUrl.size + 1), url: e.url, title: e.title || '', lastVisitTime: time, visitCount: 0, typedCount: 0 }));
      }
      item.visitCount++;
    }
    return [...byUrl.values()].slice(0, max || undefined);
  });
  handle('devbrows.history.getVisits', (event, details = {}) =>
    host
      .history()
      .filter((e) => e.url === details.url && !e.query)
      .map((e, i) => ({ id: String(i + 1), visitId: String(i + 1), visitTime: e.time || 0, referringVisitId: '0', transition: 'link', isLocal: true })),
  );

  const tree = () => bookmarkTree(host.favorites());
  const find = (id) => {
    const node = tree().nodes.get(String(id));
    if (!node) throw new Error("Can't find bookmark for id.");
    return node;
  };
  handle('devbrows.bookmarks.getTree', () => [tree().root]);
  handle('devbrows.bookmarks.getSubTree', (event, id) => [find(id)]);
  handle('devbrows.bookmarks.getChildren', (event, id) => (find(id).children || []).map(shallow));
  handle('devbrows.bookmarks.get', (event, ids) => [].concat(ids).map((id) => shallow(find(id))));
  handle('devbrows.bookmarks.getRecent', (event, n = 10) =>
    [...tree().nodes.values()]
      .filter((b) => b.url)
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, n)
      .map(shallow),
  );
  handle('devbrows.bookmarks.search', (event, query) => {
    const q = typeof query === 'string' ? { query } : query || {};
    const words = String(q.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return [...tree().nodes.values()]
      .filter((b) => b.id !== '0' && b.id !== '1')
      .filter((b) => (q.url ? b.url === q.url : true) && (q.title ? b.title === q.title : true))
      .filter((b) => words.every((w) => b.title.toLowerCase().includes(w) || String(b.url || '').toLowerCase().includes(w)))
      .map(shallow);
  });

  // Connexion OAuth : la page du fournisseur s'ouvre dans une fenêtre ; quand elle renvoie vers
  // https://<id>.chromiumapp.org/…, on ferme la fenêtre et l'extension reçoit cette adresse.
  handle('devbrows.identity.launchWebAuthFlow', (event, details = {}) =>
    new Promise((resolve, reject) => {
      if (!details.url) return reject(new Error('Missing url'));
      const prefix = `https://${event.extension.id}.chromiumapp.org/`;
      const auth = new BrowserWindow({
        width: 520,
        height: 680,
        parent: host.window() || undefined,
        title: event.extension.name,
        show: details.interactive !== false,
        webPreferences: { session, sandbox: true, contextIsolation: true },
      });
      auth.setMenuBarVisibility(false);
      let done = false;
      const finish = (url) => {
        if (done) return;
        done = true;
        if (url) resolve(url);
        else reject(new Error(details.interactive === false ? 'User interaction required.' : 'The user did not approve access.'));
        if (!auth.isDestroyed()) auth.close();
      };
      const watch = (e, url) => {
        if (String(url).startsWith(prefix)) {
          e.preventDefault();
          finish(url);
        }
      };
      auth.webContents.on('will-redirect', watch);
      auth.webContents.on('will-navigate', watch);
      auth.webContents.on('did-fail-load', (e, code, desc, url, main) => main && String(url).startsWith(prefix) && finish(url));
      auth.on('closed', () => finish(null));
      // Sans interaction possible, la page doit renvoyer d'elle-même tout de suite.
      if (details.interactive === false) setTimeout(() => finish(null), (details.timeoutMsForNonInteractive || 1000) + 5000);
      auth.loadURL(details.url).catch(() => {});
    }),
  );

  // Panneau latéral : ouvert dans une fenêtre étroite à droite de dev-brows.
  route('devbrows.sidePanel.open', (event) => {
    const p = ((event.extension.manifest || {}).side_panel || {}).default_path;
    if (!p) throw new Error('No side panel');
    host.openSidePanel(`${event.extension.url}${p.replace(/^\//, '')}`, event.extension.name);
  });

  handle('devbrows.downloads.download', (event, options = {}) => {
    if (!/^(https?|data|blob):/i.test(String(options.url || ''))) throw new Error('Invalid url');
    host.download(String(options.url));
    return host.downloads().length;
  });
  handle('devbrows.downloads.search', () =>
    host.downloads().map((d, i, all) => ({
      id: all.length - i,
      url: d.url || '',
      finalUrl: d.url || '',
      filename: d.path,
      state: d.state === 'completed' ? 'complete' : d.state === 'progressing' ? 'in_progress' : 'interrupted',
      paused: !!d.paused,
      bytesReceived: d.received || 0,
      totalBytes: d.total || 0,
      fileSize: d.total || 0,
      exists: d.state === 'completed',
      incognito: false,
      danger: 'safe',
      mime: '',
    })),
  );
  const byId = (id) => {
    const all = host.downloads();
    return all[all.length - id];
  };
  handle('devbrows.downloads.show', (event, id) => {
    const d = byId(id);
    if (d) host.showItem(d.path);
  });
  // Ouvrir un fichier peut lancer un programme : la personne dit oui à chaque fois.
  handle('devbrows.downloads.open', (event, id) => {
    const d = byId(id);
    if (d && d.state === 'completed') return host.openItem(d.path, event.extension.name);
    return undefined;
  }, ['downloads.open']);
  handle('devbrows.downloads.showDefaultFolder', () => host.showDownloadsFolder());
}

module.exports = { registerExtraApis, bookmarkTree, extensionInfo };
