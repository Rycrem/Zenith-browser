'use strict';

// Mode mobile (Ctrl+Alt+M) : les pages se croient sur un téléphone (taille d'écran, densité,
// tactile, user agent) et s'affichent à la taille de l'appareil, au milieu de l'écran.
// Les réglages passent par le protocole des DevTools, que Chromium applique comme son propre mode appareil.
const state = require('../state');

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const chrome = () => process.versions.chrome.split('.')[0];
const androidUa = (model) => `Mozilla/5.0 (Linux; Android 14; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome()}.0.0.0 Mobile Safari/537.36`;

const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667, dpr: 2, os: 'ios' },
  { name: 'iPhone 15', width: 393, height: 852, dpr: 3, os: 'ios' },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, dpr: 3, os: 'ios' },
  { name: 'Pixel 8', width: 412, height: 915, dpr: 2.625, os: 'android' },
  { name: 'Galaxy S23', width: 360, height: 780, dpr: 3, os: 'android' },
  { name: 'iPad Mini', width: 768, height: 1024, dpr: 2, os: 'ipad' },
];

// Résolutions enregistrées à la main : { name, width, height }, vues comme un Android.
const customDevices = () => state.settings.data.mobileDevices || [];
const allDevices = () => [...DEVICES, ...customDevices().map((d) => ({ ...d, dpr: 2, os: 'android', custom: true }))];

function userAgent(d) {
  if (d.os === 'ios') return { userAgent: IOS_UA };
  if (d.os === 'ipad') return { userAgent: IPAD_UA };
  const v = chrome();
  return {
    userAgent: androidUa(d.custom ? 'K' : d.name),
    userAgentMetadata: {
      brands: [{ brand: 'Chromium', version: v }, { brand: 'Google Chrome', version: v }, { brand: 'Not)A;Brand', version: '99' }],
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: '',
      model: d.custom ? '' : d.name,
      mobile: true,
    },
  };
}

// Taille de la page dans l'écran r : celle de l'appareil, réduite si elle ne tient pas.
function fit(r) {
  const d = state.mobile;
  const scale = Math.min(1, r.width / d.width, r.height / d.height);
  const width = Math.round(d.width * scale);
  const height = Math.round(d.height * scale);
  return { bounds: { x: r.x + Math.round((r.width - width) / 2), y: r.y, width, height }, scale };
}

function send(wc, method, params) {
  return wc.debugger.sendCommand(method, params).catch(() => {});
}

// Applique le mode (ou l'enlève) à une page déjà en train de charger : avant, Chromium n'a
// pas encore de quoi recevoir ces réglages (et plante).
function applyMobile(tab, scale = tab.mobileScale || 1) {
  const wc = tab.view && tab.view.webContents;
  if (!wc || wc.isDestroyed()) return;
  const d = state.mobile;
  if (!d && !tab.mobileDevice) return;
  if (d && tab.mobileDevice === d && tab.mobileScale === scale) return;
  if (d && !wc.getURL() && !wc.isLoading()) return;
  const fresh = tab.mobileDevice !== d;
  tab.mobileDevice = d;
  tab.mobileScale = scale;
  // Sans le mode, le débogueur se débranche, et ses réglages partent avec lui.
  if (!d) {
    try {
      wc.debugger.detach();
    } catch {}
    return;
  }
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  } catch {
    return; // un autre débogueur est déjà branché
  }
  send(wc, 'Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: true, scale });
  if (!fresh) return;
  send(wc, 'Emulation.setUserAgentOverride', userAgent(d));
  send(wc, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  send(wc, 'Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
}

// d : un appareil de allDevices(), ou null pour revenir à l'ordinateur. Les pages se rechargent.
function setMobile(d) {
  state.mobile = d;
  const ui = require('../window/ui');
  for (const w of state.allWindows()) {
    for (const tab of w.tabs) {
      if (!tab.view || tab.view.webContents.isDestroyed() || !tab.view.webContents.getURL()) continue;
      applyMobile(tab);
      tab.view.webContents.reload();
    }
  }
  ui.layoutAll();
  ui.sendStateAll();
}

function saveCustom(name, width, height) {
  const list = customDevices().filter((d) => d.name !== name);
  list.push({ name, width, height });
  state.settings.data.mobileDevices = list;
  state.settings.save();
}

function removeCustom(name) {
  state.settings.data.mobileDevices = customDevices().filter((d) => d.name !== name);
  state.settings.save();
}

Object.assign(module.exports, { DEVICES, allDevices, fit, applyMobile, setMobile, saveCustom, removeCustom });
