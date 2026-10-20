'use strict';

const fs = require('fs');
const path = require('path');
const { net } = require('electron');
const AdmZip = require('adm-zip');
const { crxToZip, extensionIdFrom } = require('../shared/crx');
const { t } = require('../shared/i18n');

// uBlock Origin complet (MV2) n'est plus sur le Chrome Web Store : on le prend dans ses Releases GitHub.
// uBlock Origin Lite (MV3) bloque avec declarativeNetRequest, qu'Electron ne gère pas.
const UBLOCK_IDS = ['cjpalhdlnbpafiamejdnhcphjbkeiagm', 'ddkjiahejlhfcafbddmgiahcphecmpfh'];
const UBLOCK_NAMES = /^(ublock|ubo|ublock[ -]?origin|ublock0)$/i;

// Vrai si la version a est plus récente que b (« 1.62.0 » > « 1.61.2 »).
function newer(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// Gère les extensions Chrome : installation depuis le Chrome Web Store ou un dossier,
// activation, désactivation et popups. La liste est gardée dans settings.extensions.
class Extensions {
  constructor(ses, settings, dir) {
    this.ses = ses;
    this.api = ses.extensions || ses; // ses.extensions depuis Electron 35
    this.others = []; // autres sessions (navigation privée) qui chargent les mêmes extensions
    this.settings = settings;
    this.dir = dir;
    if (!Array.isArray(settings.data.extensions)) settings.data.extensions = [];
  }

  get list() {
    return this.settings.data.extensions;
  }

  // uBlock Origin livré avec l'appli : copié au premier lancement, puis à chaque nouvelle version.
  // Si on l'a supprimé avec « ext rm », il n'est pas réinstallé.
  installBundledUblock(src) {
    if (!src || !fs.existsSync(path.join(src, 'manifest.json'))) return null;
    const dir = path.join(this.dir, 'ublock-origin');
    const version = this.readManifest(src).version;
    const data = this.settings.data;
    let entry = this.list.find((e) => e.path === dir);
    if (!entry && data.ublockBundled) return null;
    if (entry && fs.existsSync(path.join(dir, 'manifest.json'))) {
      // Déjà installé : on ne remplace que par une version plus récente (« ext add ublock » a pu en mettre une).
      if (!newer(version, this.readManifest(dir).version)) {
        data.ublockBundled = version;
        return null;
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    fs.cpSync(src, dir, { recursive: true });
    if (!entry) {
      entry = { path: dir, enabled: true, alias: 'ublock' };
      this.list.unshift(entry);
    }
    data.ublockBundled = version;
    this.settings.save();
    return version;
  }

  // Charge aussi les extensions dans une autre session (navigation privée).
  async attach(session) {
    const api = session.extensions || session;
    this.others.push(api);
    for (const ext of this.list) {
      if (!ext.enabled) continue;
      try {
        await api.loadExtension(ext.path, { allowFileAccess: false });
      } catch {
        // déjà signalée au chargement principal
      }
    }
  }

  unloadEverywhere(id) {
    this.api.removeExtension(id);
    for (const api of this.others) if (api.getExtension(id)) api.removeExtension(id);
  }

  async loadAll() {
    for (const ext of this.list) {
      if (!ext.enabled) continue;
      try {
        await this.load(ext);
      } catch (err) {
        ext.error = err.message;
      }
    }
  }

  async load(ext) {
    // Pas d'accès aux pages file:// : l'interface de dev-brows en est une, les extensions n'ont pas à s'y injecter.
    const loaded = await this.api.loadExtension(ext.path, { allowFileAccess: false });
    for (const api of this.others) if (!api.getExtension(loaded.id)) await api.loadExtension(ext.path, { allowFileAccess: false }).catch(() => {});
    ext.id = loaded.id;
    ext.name = this.readName(ext.path, loaded.name);
    ext.popup = this.readPopup(ext.path);
    ext.dnrOnly = this.blocksWithDnrOnly(ext.path);
    delete ext.error;
    return ext;
  }

  readManifest(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  }

  // Les noms du type __MSG_appName__ sont traduits via _locales.
  readName(dir, fallback) {
    try {
      const manifest = this.readManifest(dir);
      const m = String(manifest.name || '').match(/^__MSG_(\w+)__$/);
      if (!m) return manifest.name || fallback;
      for (const locale of ['fr', manifest.default_locale, 'en']) {
        if (!locale) continue;
        const file = path.join(dir, '_locales', locale, 'messages.json');
        if (!fs.existsSync(file)) continue;
        const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
        const key = Object.keys(messages).find((k) => k.toLowerCase() === m[1].toLowerCase());
        if (key) return messages[key].message;
      }
    } catch {
      // nom illisible : on garde celui d'Electron
    }
    return fallback;
  }

  // Une extension MV3 qui bloque seulement avec declarativeNetRequest ne bloque rien dans Electron.
  blocksWithDnrOnly(dir) {
    try {
      const m = this.readManifest(dir);
      const perms = [...(m.permissions || []), ...(m.optional_permissions || [])];
      return perms.some((p) => String(p).startsWith('declarativeNetRequest')) && !perms.includes('webRequestBlocking');
    } catch {
      return false;
    }
  }

  readPopup(dir) {
    try {
      const manifest = this.readManifest(dir);
      const action = manifest.action || manifest.browser_action || manifest.page_action || {};
      return action.default_popup || null;
    } catch {
      return null;
    }
  }

  makeAlias(name) {
    const base = String(name || 'ext').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'ext';
    let alias = base;
    let i = 2;
    while (this.list.some((e) => e.alias === alias)) alias = `${base}${i++}`;
    return alias;
  }

  // ext add <id | lien du Chrome Web Store | dossier décompressé | ublock>
  async add(source) {
    let dir;
    const id = extensionIdFrom(source);
    if (UBLOCK_NAMES.test(source.trim()) || UBLOCK_IDS.includes(id)) {
      // Déjà là : on la remplace par la dernière version.
      const old = this.list.findIndex((e) => e.path === path.join(this.dir, 'ublock-origin'));
      if (old >= 0) this.remove(old + 1);
      dir = await this.downloadUblock();
    } else if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
      dir = path.resolve(source);
    } else {
      if (!id) throw new Error(t('donne un lien du Chrome Web Store, un identifiant, un dossier ou « ublock »'));
      dir = await this.download(id);
    }
    if (this.list.some((e) => e.path === dir)) throw new Error(t('extension déjà installée'));
    const ext = { path: dir, enabled: true };
    await this.load(ext);
    ext.alias = this.makeAlias(ext.name);
    this.list.push(ext);
    this.settings.save();
    return ext;
  }

  async download(id) {
    const url = 'https://clients2.google.com/service/update2/crx?response=redirect'
      + `&prodversion=${process.versions.chrome}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(t('téléchargement refusé ({status})', { status: res.status }));
    return this.unpack(new AdmZip(crxToZip(Buffer.from(await res.arrayBuffer()))), id);
  }

  // Met à jour les extensions installées depuis le Chrome Web Store et uBlock Origin.
  // Renvoie [{ name, from, to }] pour celles mises à jour, [{ name, error }] pour les échecs.
  async updateAll() {
    const done = [];
    for (const ext of this.list) {
      const source = this.updateSource(ext);
      if (!source) continue;
      try {
        const from = this.readManifest(ext.path).version;
        const to = source === 'ublock' ? (await this.ublockRelease()).version : await this.storeVersion(source, from);
        if (!to || !newer(to, from)) continue;
        if (ext.id && ext.enabled) this.unloadEverywhere(ext.id);
        if (source === 'ublock') await this.downloadUblock();
        else await this.download(source);
        if (ext.enabled) await this.load(ext);
        done.push({ name: ext.name || ext.alias, from, to });
      } catch (err) {
        done.push({ name: ext.name || ext.alias, error: err.message });
      }
    }
    if (done.length) this.settings.save();
    return done;
  }

  // D'où vient la mise à jour : identifiant du Chrome Web Store, « ublock », ou rien (dossier perso).
  updateSource(ext) {
    if (!ext.path.startsWith(this.dir + path.sep)) return null;
    const base = path.basename(ext.path);
    if (base === 'ublock-origin') return 'ublock';
    return /^[a-p]{32}$/.test(base) ? base : null;
  }

  // Dernière version publiée sur le Chrome Web Store.
  async storeVersion(id, current) {
    const url = 'https://clients2.google.com/service/update2/crx?response=updatecheck'
      + `&prodversion=${process.versions.chrome}&acceptformat=crx2,crx3&x=id%3D${id}%26v%3D${current}%26uc`;
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(`Chrome Web Store : ${res.status}`);
    const m = (await res.text()).match(/<updatecheck[^>]*\sversion="([^"]+)"/);
    return m ? m[1] : null;
  }

  async ublockRelease() {
    const rel = await net.fetch('https://api.github.com/repos/gorhill/uBlock/releases/latest', { headers: { accept: 'application/vnd.github+json' } });
    if (!rel.ok) throw new Error(t('GitHub ne répond pas ({status})', { status: rel.status }));
    const data = await rel.json();
    return { version: String(data.tag_name || '').replace(/^v/, ''), assets: data.assets || [] };
  }

  // Dernière version de uBlock Origin pour Chromium, depuis github.com/gorhill/uBlock.
  async downloadUblock() {
    const asset = (await this.ublockRelease()).assets.find((a) => /chromium\.zip$/.test(a.name));
    if (!asset) throw new Error(t('pas de version Chromium de uBlock Origin dans la dernière Release'));
    const res = await net.fetch(asset.browser_download_url);
    if (!res.ok) throw new Error(t('téléchargement refusé ({status})', { status: res.status }));
    return this.unpack(new AdmZip(Buffer.from(await res.arrayBuffer())), 'ublock-origin');
  }

  unpack(zip, name) {
    const dir = path.join(this.dir, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const entries = zip.getEntries();
    // Certaines archives mettent tout dans un dossier (« uBlock0.chromium/manifest.json ») : on l'enlève.
    const manifest = entries.find((e) => /(^|\/)manifest\.json$/.test(e.entryName) && e.entryName.split('/').length <= 2);
    const prefix = manifest ? manifest.entryName.replace(/manifest\.json$/, '') : '';
    for (const entry of entries) {
      if (!entry.entryName.startsWith(prefix)) continue;
      // Pas de chemins qui sortent du dossier de l'extension.
      const target = path.resolve(dir, entry.entryName.slice(prefix.length));
      if (!target.startsWith(dir + path.sep)) continue;
      if (entry.isDirectory) fs.mkdirSync(target, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.getData());
      }
    }
    // Chrome refuse les dossiers commençant par « _ » sauf _locales ; on retire _metadata.
    fs.rmSync(path.join(dir, '_metadata'), { recursive: true, force: true });
    return dir;
  }

  get(n) {
    const ext = this.list[n - 1];
    if (!ext) throw new Error(t('pas d\'extension numéro {n}', { n }));
    return ext;
  }

  async setEnabled(n, enabled) {
    const ext = this.get(n);
    if (ext.enabled === enabled) return ext;
    if (enabled) await this.load(ext);
    else if (ext.id) this.unloadEverywhere(ext.id);
    ext.enabled = enabled;
    this.settings.save();
    return ext;
  }

  remove(n) {
    const ext = this.get(n);
    if (ext.id && ext.enabled) this.unloadEverywhere(ext.id);
    this.list.splice(n - 1, 1);
    if (ext.path.startsWith(this.dir + path.sep)) fs.rmSync(ext.path, { recursive: true, force: true });
    this.settings.save();
    return ext;
  }

  rename(n, alias) {
    if (!/^[\w-]{1,12}$/.test(alias || '')) throw new Error(t('alias invalide (lettres, chiffres, 12 max)'));
    const ext = this.get(n);
    ext.alias = alias;
    this.settings.save();
    return ext;
  }

  // Épinglée : affichée dans la barre du bas (par défaut). Sinon, seulement dans la popup des extensions.
  pin(n) {
    const ext = this.get(n);
    ext.pinned = ext.pinned === false;
    this.settings.save();
    return ext;
  }

  popupUrl(n) {
    const ext = this.get(n);
    if (!ext.enabled) throw new Error(t('{alias} est désactivée (ext on {n})', { alias: ext.alias, n }));
    if (!ext.popup) throw new Error(t('{alias} n\'a pas de popup', { alias: ext.alias }));
    return `chrome-extension://${ext.id}/${ext.popup.replace(/^\//, '')}`;
  }

  summary() {
    return this.list.map((e, i) => ({
      n: i + 1,
      alias: e.alias,
      name: e.name,
      enabled: e.enabled,
      pinned: e.pinned !== false,
      popup: !!e.popup,
      dnrOnly: !!e.dnrOnly,
      error: e.error || null,
    }));
  }
}

module.exports = { Extensions, newer };
