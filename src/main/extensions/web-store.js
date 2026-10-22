'use strict';

const { t } = require('../../shared/i18n');
const { storeExtensionId } = require('../../shared/crx');
const state = require('../state');
const theme = require('../window/theme');
const ui = require('../window/ui');
const output = require('../terminal/output');
const commands = require('../terminal/commands');
const modal = require('../panels/modal');

// Le Chrome Web Store grise « Ajouter à Chrome » hors de Chrome : on ajoute dans la page
// un bouton « Ajouter à dev-brows ». Il vit dans un monde isolé (le site ne voit ni son code
// ni le secret) et signale le clic par un message console que seul ce secret authentifie.
const STORE_WORLD = 1042;
const STORE_SECRET = `dev-brows-store-${require('crypto').randomBytes(12).toString('hex')}`;

function storeHint(tab, url) {
  const id = storeExtensionId(url);
  if (!id || tab.storeHint === id) return;
  tab.storeHint = id;
  const installed = state.exts.list.some((e) => e.id === id);
  output.print([{ t: installed ? t('  extension déjà installée (« ext » pour la gérer)') : t('  ↓ le bouton « Ajouter » de la page (ou « ext add ») installe cette extension'), c: installed ? 'dim' : 'warn' }]);
}

function storeButton(tab, busy = false) {
  const wc = tab.view && tab.view.webContents;
  if (!wc || wc.isDestroyed()) return;
  let host = '';
  try {
    host = new URL(wc.getURL()).hostname;
  } catch {}
  if (host !== 'chromewebstore.google.com' && host !== 'chrome.google.com') return;
  const id = storeExtensionId(wc.getURL());
  const installed = !!id && state.exts.list.some((e) => e.id === id);
  const opts = {
    show: !!id && !tab.storeApi,
    label: busy ? t('installation…') : installed ? t('✓ installée dans Zenith') : t('Ajouter à Zenith'),
    disabled: busy || installed,
    accent: theme.accentColor(),
    secret: STORE_SECRET,
  };
  const code = `(${(o) => {
    let b = document.getElementById('dev-brows-store-install');
    if (!o.show) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement('button');
      b.id = 'dev-brows-store-install';
      b.addEventListener('click', (e) => {
        if (e.isTrusted && !b.disabled) console.info(`${o.secret}:install`);
      });
      document.documentElement.append(b);
    }
    b.textContent = o.label;
    b.disabled = o.disabled;
    b.style.cssText = `position:fixed;right:24px;bottom:24px;z-index:2147483647;padding:12px 20px;border:0;border-radius:24px;
      font:600 15px/1 system-ui,sans-serif;color:#0E1116;background:${o.accent};box-shadow:0 4px 16px rgba(0,0,0,.3);
      cursor:${o.disabled ? 'default' : 'pointer'};opacity:${o.disabled ? 0.75 : 1}`;
  }})(${JSON.stringify(opts)})`;
  wc.executeJavaScriptInIsolatedWorld(STORE_WORLD, [{ code }]).catch(() => {});
}

// Le vrai bouton du store : appels de chrome.webstorePrivate et chrome.management posés par
// store-preload.js. Seul le cadre principal d'un onglet sur chromewebstore.google.com est écouté.
const STORE_ORIGIN = 'https://chromewebstore.google.com';
const STORE = { SUCCESS: 'success', USER_CANCELLED: 'user_cancelled', GESTURE: 'user_gesture_required', ALREADY: 'already_installed', ERROR: 'install_error', IN_PROGRESS: 'install_in_progress' };
let storeInstalling = false;

function storeExtInfo(e) {
  const loaded = (state.ses.extensions || state.ses).getExtension(e.id);
  return { id: e.id, name: e.name, shortName: e.name, version: (loaded && loaded.version) || '', enabled: !!e.enabled, type: 'extension', installType: 'normal', mayDisable: true, isApp: false };
}

function sendStoreEvent(name, arg) {
  for (const tb of state.tabs) {
    const wc = tb.view && tb.view.webContents;
    if (!wc || wc.isDestroyed()) continue;
    try {
      if (new URL(wc.getURL()).origin === STORE_ORIGIN) wc.send('store:event', name, arg);
    } catch {}
  }
}

async function storeCall(tab, name, args) {
  if (!tab.storeApi) {
    tab.storeApi = true;
    storeButton(tab); // le vrai bouton marche : plus besoin du nôtre
  }
  const indexOf = (id) => state.exts.list.findIndex((e) => e.id === id) + 1;
  switch (name) {
    case 'getFullChromeVersion':
      return { version_number: process.versions.chrome };
    case 'getExtensionStatus': {
      const e = state.exts.list.find((x) => x.id === args[0]);
      return e ? (e.enabled ? 'enabled' : 'disabled') : 'installable';
    }
    case 'completeInstall':
      return STORE.SUCCESS;
    case 'beginInstall': {
      const [details = {}, gesture] = args;
      const id = String(details.id || '');
      if (!/^[a-p]{32}$/.test(id)) return { result: 'invalid_id', error: 'Invalid id' };
      if (!gesture) return { result: STORE.GESTURE, error: 'User gesture required' };
      if (indexOf(id)) return { result: STORE.ALREADY, error: 'Already installed' };
      if (storeInstalling) return { result: STORE.IN_PROGRESS, error: 'Install in progress' };
      let manifest = {};
      try {
        manifest = JSON.parse(details.manifest || '{}');
      } catch {}
      const label = details.localizedName || manifest.name || id;
      const perms = [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter((p) => typeof p === 'string');
      storeInstalling = true;
      try {
        const yes = await modal.confirmModal({
          title: t('Ajouter une extension'),
          message: t('Ajouter « {name} » à Zenith ?', { name: label }),
          detailLabel: perms.length ? t('Elle pourra :') : '',
          details: perms,
          ok: t('Ajouter l\'extension'),
          cancel: t('Annuler'),
        });
        if (!yes) return { result: STORE.USER_CANCELLED, error: 'User cancelled install' };
        const result = await commands.exec(`ext add ${id}`);
        if (result && result.lines && result.lines.length) output.print(result.lines);
        const n = indexOf(id);
        if (!n) return { result: STORE.ERROR, error: 'Install failed' };
        sendStoreEvent('onInstalled', storeExtInfo(state.exts.get(n)));
        return { result: STORE.SUCCESS, error: '' };
      } finally {
        storeInstalling = false;
      }
    }
    case 'getAll':
      return state.exts.list.filter((e) => e.id).map(storeExtInfo);
    case 'get': {
      const n = indexOf(args[0]);
      return n ? storeExtInfo(state.exts.get(n)) : { error: 'No such extension', result: undefined };
    }
    case 'setEnabled': {
      const n = indexOf(args[0]);
      if (!n) return { error: 'No such extension', result: undefined };
      const ext = await state.exts.setEnabled(n, !!args[1]);
      sendStoreEvent(ext.enabled ? 'onEnabled' : 'onDisabled', storeExtInfo(ext));
      ui.sendState();
      return undefined;
    }
    case 'uninstall': {
      const n = indexOf(args[0]);
      if (!n || !args[1]) return { error: n ? 'User gesture required' : 'No such extension', result: undefined };
      const ext = state.exts.get(n);
      const yes = await modal.confirmModal({
        title: t('Désinstaller une extension'),
        message: t('Désinstaller « {name} » ?', { name: ext.name }),
        ok: t('Désinstaller'),
        cancel: t('Annuler'),
      });
      if (!yes) return { error: 'User cancelled uninstall', result: undefined };
      state.exts.remove(n);
      output.print([{ t: t('  ✓ extension désinstallée'), c: 'ok' }]);
      sendStoreEvent('onUninstalled', ext.id);
      ui.sendState();
      return undefined;
    }
    default:
      throw new Error(`store: ${name}`);
  }
}

async function installFromStore(tab) {
  const wc = tab.view && tab.view.webContents;
  const id = wc && storeExtensionId(wc.getURL());
  if (!id || state.exts.list.some((e) => e.id === id)) return;
  storeButton(tab, true);
  try {
    const result = await commands.exec(`ext add ${id}`);
    if (result && result.lines && result.lines.length) output.print(result.lines);
  } finally {
    storeButton(tab);
  }
}

Object.assign(module.exports, { STORE_SECRET, storeHint, storeButton, STORE_ORIGIN, storeCall, installFromStore });
