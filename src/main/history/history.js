'use strict';

const { shortUrl } = require('../../shared/search');
const state = require('../state');
const screens = require('../terminal/screens');

const HISTORY_MAX = 5000;

function showHist(tab, filter) {
  const f = (filter || '').toLowerCase();
  const rows = [];
  const numbered = [];
  const entries = state.history.data.entries;
  for (let i = entries.length - 1; i >= 0 && rows.length < 200; i--) {
    const e = entries[i];
    const label = e.query ? `brows « ${e.query} »` : e.url;
    if (f && !`${label} ${e.title || ''}`.toLowerCase().includes(f)) continue;
    numbered.push(e.query ? { kind: 'search', query: e.query } : { kind: 'url', url: e.url });
    rows.push({ n: numbered.length, time: e.time, label: e.query ? label : shortUrl(e.url), title: e.title || '' });
  }
  screens.setScreen(tab, { kind: 'hist', filter: filter || '', rows, total: entries.length }, numbered);
}

function addHistory(entry, tab) {
  if (state.privateMode || (tab && tab.private)) return; // rien n'est retenu en navigation privée
  const entries = state.history.data.entries;
  const last = entries[entries.length - 1];
  if (last && last.url === entry.url && !entry.query) return;
  entries.push({ ...entry, time: Date.now() });
  if (entries.length > HISTORY_MAX) entries.splice(0, entries.length - HISTORY_MAX);
  state.history.save();
  if (state.chromeApi && /^https?:/.test(entry.url || '') && !entry.query) {
    const visitCount = entries.filter((e) => e.url === entry.url).length;
    state.chromeApi.ctx.router.broadcastEvent('history.onVisited', { id: '0', url: entry.url, title: entry.title || '', lastVisitTime: Date.now(), visitCount, typedCount: 0 });
  }
}

Object.assign(module.exports, { showHist, addHistory });
