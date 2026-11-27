'use strict';

const { session } = require('electron');
const path = require('path');
const { t } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const chromeApis = require('../extensions/chrome-api');
const split = require('../split/split');
const output = require('../terminal/output');
const dl = require('../downloads/downloads');
const extLogs = require('../extensions/logs');
const webauthn = require('../security/webauthn');
const permissions = require('../security/permissions');

// Session à part (cookies, cache, stockage des sites), effacée en entrant et en sortant.
// Les extensions y sont chargées aussi ; leurs propres données sont gardées d'une fois sur l'autre.
async function setupPrivateSession() {
  state.privSes = session.fromPartition('persist:prive');
  state.privApi = chromeApis.setupChromeApi(state.privSes);
  extLogs.watchWorkerLogs(state.privSes);
  state.privSes.registerPreloadScript({ id: 'dev-brows-browser-alias', type: 'frame', filePath: path.join(__dirname, '..', 'extensions', 'ext-preload.js') });
  state.privSes.registerPreloadScript({ id: 'dev-brows-sw-events', type: 'service-worker', filePath: path.join(__dirname, '..', 'extensions', 'ext-sw-preload.js') });
  for (const type of ['frame', 'service-worker']) state.privSes.registerPreloadScript({ id: `dev-brows-storage-sync-${type}`, type, filePath: path.join(__dirname, '..', 'extensions', 'ext-sync-preload.js') });
  dl.setupDownloads(state.privSes);
  permissions.setupPermissions(state.privSes);
  webauthn.setupWebAuthn(state.privSes);
  await state.exts.attach(state.privSes);
}

function wipePrivate() {
  const keep = state.exts.list.filter((e) => e.id).map((e) => `chrome-extension://${e.id}`);
  permissions.forgetPrivate();
  return Promise.all([state.privSes.clearData({ excludeOrigins: keep }), state.privSes.clearCache(), state.privSes.clearAuthCache()]).catch(() => {});
}

// Les onglets normaux sont mis de côté (cachés) le temps de la navigation privée, puis rendus.
async function setPrivate(on) {
  if (!!state.privateMode === on) return;
  if (state.panel && !state.panel.win.isDestroyed()) state.panel.win.close();
  if (state.popupWin && !state.popupWin.isDestroyed()) state.popupWin.close();
  if (on) {
    if (!state.privSes) {
      output.print([{ t: t('  ouverture de la navigation privée (chargement des extensions)…'), c: 'dim' }]);
      await setupPrivateSession();
    }
    await wipePrivate();
    state.privateMode = { tabs: state.tabs.splice(0), panes: state.panes.splice(0), activePane: state.activePane };
    for (const tb of state.privateMode.tabs) {
      if (tb.view) tb.view.setVisible(false);
      if (tb.dev && !tb.devWin) tb.dev.setVisible(false);
    }
    state.panes.push({ tabId: null });
    state.activePane = 0;
    tabList.createTab();
  } else {
    const saved = state.privateMode;
    state.privateMode = null;
    for (const tb of state.tabs.splice(0)) tabList.destroyTab(tb);
    state.tabs.push(...saved.tabs);
    state.panes.splice(0, state.panes.length, ...saved.panes);
    state.activePane = saved.activePane;
    wipePrivate();
  }
  if (process.platform !== 'darwin' && state.win) state.win.setTitleBarOverlay({ color: state.privateMode ? '#1B0F26' : '#000000' });
  ui.layout();
  ui.sendState();
  output.focusTerminal();
}

// En split, la navigation privée ne concerne que l'écran actif : un onglet privé y remplace
// l'onglet affiché, qui revient quand l'écran sort de la navigation privée.
async function setPanePrivate(idx, on) {
  const pane = state.panes[idx];
  const cur = tabList.getTab(pane.tabId);
  if (!!cur.private === on) return;
  if (on) {
    if (!state.privSes) {
      output.print([{ t: t('  ouverture de la navigation privée (chargement des extensions)…'), c: 'dim' }]);
      await setupPrivateSession();
    }
    pane.normalTabId = cur.id;
    tabList.createTab({ pane: idx, priv: true });
  } else {
    const other = state.panes.find((p, i) => i !== idx);
    const keep = other && other.tabId;
    const back = tabList.getTab(pane.normalTabId);
    const shown = new Set(state.panes.map((p) => p.tabId));
    split.showInPane(back && !shown.has(back.id) ? back : state.tabs.find((tb) => !tb.private && !shown.has(tb.id)) || tabList.createTab({ background: true, priv: false }), idx);
    for (const tb of state.tabs.filter((x) => x.private && x.id !== keep)) tabList.closeTab(tb);
  }
  output.focusTerminal();
}

async function togglePrivate() {
  if (!state.privateMode && (state.panes.length > 1 || tabList.activeTab().private)) await setPanePrivate(state.activePane, !tabList.activeTab().private);
  else await setPrivate(!state.privateMode);
}

Object.assign(module.exports, { wipePrivate, setPrivate, setPanePrivate, togglePrivate });
