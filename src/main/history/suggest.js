'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('../state');
const theme = require('../window/theme');
const tabList = require('../tabs/tabs');
const navigation = require('../tabs/navigation');

// Les pages de l'historique qui correspondent à ce qui est tapé : d'abord celles dont
// l'adresse commence par le texte, puis celles qui le contiennent, puis par le titre ;
// à égalité, les plus visitées puis les plus récentes.
function historySuggestions(text, max = 8) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return [];
  const byUrl = new Map();
  const entries = state.history.data.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e.url || e.query || !/^https?:/.test(e.url)) continue;
    let s = byUrl.get(e.url);
    if (!s) byUrl.set(e.url, (s = { url: e.url, title: e.title || '', visits: 0, time: e.time || 0 }));
    s.visits++;
    if (!s.title && e.title) s.title = e.title;
  }
  const out = [];
  for (const s of byUrl.values()) {
    const bare = s.url.replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
    const score = bare.startsWith(q) ? 3 : bare.includes(q) ? 2 : s.title.toLowerCase().includes(q) ? 1 : 0;
    if (score) out.push({ ...s, score });
  }
  out.sort((a, b) => b.score - a.score || b.visits - a.visits || b.time - a.time);
  return out.slice(0, max).map(({ url, title }) => ({ url, title }));
}

// Fenêtre sous le champ d'adresse : la page (vue native) couvrirait une liste dans l'interface.
function hideSuggest() {
  state.suggestList = [];
  if (state.suggest && !state.suggest.win.isDestroyed()) state.suggest.win.hide();
}

function showSuggest(rect, selected) {
  if (!state.win || state.win.isDestroyed() || !state.suggestList.length || !rect) return hideSuggest();
  const b = state.win.getContentBounds();
  const width = Math.max(340, Math.round(rect.width));
  const bounds = {
    x: Math.max(b.x, Math.min(b.x + Math.round(rect.x), b.x + b.width - width)),
    y: b.y + Math.round(rect.y + rect.height) + 2,
    width,
    height: state.suggestList.length * 26 + 8,
  };
  const key = `${theme.accentColor()}|${theme.isLight()}|${!!state.privateMode}`;
  if (state.suggest && (state.suggest.win.isDestroyed() || state.suggest.key !== key)) {
    if (!state.suggest.win.isDestroyed()) state.suggest.win.destroy();
    state.suggest = null;
  }
  if (!state.suggest) {
    const sw = new BrowserWindow({
      ...bounds,
      parent: state.win,
      frame: false,
      resizable: false,
      focusable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: theme.isLight() ? '#F6F7F9' : state.privateMode ? '#1A1024' : '#0E1116',
      webPreferences: { preload: path.join(__dirname, '..', 'panels', 'panel-preload.js'), sandbox: true, contextIsolation: true },
    });
    state.suggest = { win: sw, key, ready: false, data: null };
    const s = state.suggest;
    sw.webContents.on('did-finish-load', () => {
      s.ready = true;
      if (!s.data || sw.isDestroyed() || !state.suggestList.length) return;
      sw.webContents.send('panel:data', s.data);
      sw.showInactive();
    });
    sw.loadFile(path.join(__dirname, '../../renderer/panels/suggest.html'), { query: { accent: theme.accentColor(), mode: theme.isLight() ? 'jour' : 'nuit', private: state.privateMode ? '1' : '' } });
  }
  state.suggest.data = { list: state.suggestList, selected };
  state.suggest.win.setBounds(bounds);
  if (!state.suggest.ready) return;
  state.suggest.win.webContents.send('panel:data', state.suggest.data);
  if (!state.suggest.win.isVisible()) state.suggest.win.showInactive();
}

function suggestAction(action, arg) {
  if (action !== 'open' || !arg || !state.suggestList.some((s) => s.url === arg.url)) return;
  hideSuggest();
  state.win.webContents.send('suggest:done');
  if (arg.newTab) tabList.createTab({ url: arg.url, background: true });
  else navigation.navigate(tabList.activeTab(), arg.url);
}

Object.assign(module.exports, { historySuggestions, hideSuggest, showSuggest, suggestAction });
