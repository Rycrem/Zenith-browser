'use strict';

const state = require('../state');
const { popupWindow } = require('../panels/popup-window');
const theme = require('../window/theme');

// Aperçu d'un onglet survolé (réglage « preview ») : sous l'onglet, une image de sa page, son titre
// et son adresse. Une page cachée ne se dessine plus : on garde l'image prise quand elle est quittée.
const WIDTH = 320;

const enabled = () => state.settings.data.tabPreview !== false;
// Temps de survol avant l'aperçu, en secondes.
function delay() {
  const d = Number(state.settings.data.tabPreviewDelay);
  return Number.isFinite(d) && d >= 0 ? d : 2;
}

async function capture(tab) {
  if (!tab.view || tab.screen || tab.view.webContents.isDestroyed()) return;
  try {
    const img = await tab.view.webContents.capturePage();
    if (img.isEmpty()) return;
    const { width, height } = img.getSize();
    tab.thumb = { src: img.resize({ width: WIDTH * 2 }).toDataURL(), ratio: height / width };
  } catch {}
}

// Onglet qui va être caché (un autre prend sa place) : son image tant qu'elle est encore dessinée.
function remember(tab) {
  if (tab && enabled()) capture(tab);
}

let asked = 0;
function hidePreview() {
  asked++;
  const p = state.tabPreview;
  if (p && !p.isDestroyed()) p.hide();
}

// rect : place de l'onglet dans l'interface.
async function showPreview(id, rect) {
  const tabList = require('./tabs');
  const tab = tabList.getTab(id);
  if (!enabled() || !tab || !rect || !state.win || state.win.isDestroyed()) return;
  const n = ++asked;
  if (tabList.paneOf(tab) >= 0) await capture(tab);
  if (n !== asked || !state.win || state.win.isDestroyed()) return;
  const thumb = !tab.screen && tab.view ? tab.thumb : null;
  // L'image garde les proportions de la page, entre 100 et 240 px de haut (au-delà, le haut de la page).
  const imgH = thumb ? Math.round(Math.min(240, Math.max(100, WIDTH * thumb.ratio))) : 0;
  const data = { title: tabList.tabTitle(tab), url: tab.screen ? '' : tab.url || '', image: thumb ? thumb.src : null, height: imgH };
  const b = state.win.getContentBounds();
  const bounds = {
    x: Math.max(b.x, Math.min(b.x + Math.round(rect.x), b.x + b.width - WIDTH)),
    y: b.y + Math.round(rect.y + rect.height) + 4,
    width: WIDTH,
    height: imgH + 52,
  };
  const key = `${theme.accentColor()}|${theme.isLight()}|${!!state.privateMode}`;
  let w = state.tabPreview;
  if (w && (w.isDestroyed() || w.key !== key)) {
    if (!w.isDestroyed()) w.destroy();
    w = null;
  }
  if (!w) {
    w = popupWindow('preview.html', { ...bounds, focusable: false });
    w.key = key;
    w.ready = false;
    w.webContents.once('did-finish-load', () => {
      w.ready = true;
      if (w.isDestroyed() || !w.data || n !== asked) return;
      w.webContents.send('panel:data', w.data);
      w.showInactive();
    });
    state.tabPreview = w;
  }
  w.data = data;
  w.setBounds(bounds);
  if (!w.ready) return;
  w.webContents.send('panel:data', data);
  w.showInactive();
}

Object.assign(module.exports, { showPreview, hidePreview, remember, enabled, delay });
