'use strict';

const { app } = require('electron');
const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');

// Avertissements et erreurs des extensions (fond, pages, scripts injectés), pour « ext log ».
const extLogs = new Map(); // identifiant → [{ time, where, text }]
const EXT_URL = /^chrome-extension:\/\/([a-p]{32})\//;

function logExt(id, where, text) {
  if (!extLogs.has(id)) extLogs.set(id, []);
  const list = extLogs.get(id);
  list.push({ time: Date.now(), where, text: String(text).slice(0, 400) });
  if (list.length > 100) list.shift();
}

// level : nombre de Chromium (2 avertissement, 3 erreur) ou nom (Electron récent).
const isProblem = (level) => level === 2 || level === 3 || level === 'warning' || level === 'error';

function watchWorkerLogs(s) {
  s.serviceWorkers.on('console-message', (e, d) => {
    if (!d || !isProblem(d.level)) return;
    const worker = s.serviceWorkers.getAllRunning()[d.versionId];
    const m = EXT_URL.exec((worker && worker.scope) || d.sourceUrl || '');
    if (m) logExt(m[1], t('fond'), d.lineNumber ? `${d.message} (${t('ligne')} ${d.lineNumber})` : d.message);
  });
}

function watchExtensionLogs() {
  watchWorkerLogs(state.ses);
  app.on('web-contents-created', (e, wc) => {
    wc.on('console-message', (event, ...old) => {
      const level = event.level !== undefined ? event.level : old[0];
      if (!isProblem(level)) return;
      const message = event.message !== undefined ? event.message : old[1];
      const line = event.lineNumber !== undefined ? event.lineNumber : old[2];
      const source = (event.sourceId !== undefined ? event.sourceId : old[3]) || '';
      // Script injecté dans un site (source chrome-extension://…), ou page de l'extension (popup, offscreen).
      const fromScript = EXT_URL.exec(source);
      const fromPage = EXT_URL.exec(wc.getURL());
      const m = fromScript || fromPage;
      if (!m) return;
      const where = fromPage ? t('page') : wc.getURL().startsWith('file:') ? 'Zenith' : ui.hostOf(wc.getURL()) || t('page');
      logExt(m[1], where, `${message} (${source.replace(EXT_URL, '')}${line ? `:${line}` : ''})`);
    });
  });
}

function extLogCommand(arg, say) {
  const list = state.exts.summary();
  // Le nom n'est cherché qu'à partir de 3 lettres, sinon « n » trouverait n'importe quelle extension.
  const q = String(arg || '').toLowerCase();
  const i = /^\d+$/.test(q) ? Number(q) - 1 : list.findIndex((x) => x.alias === arg || (q.length >= 3 && (x.name || '').toLowerCase().includes(q)));
  if (!arg || !list[i]) throw new Error(t('ext log <n | alias>'));
  const ext = state.exts.get(i + 1);
  const lines = (ext.id && extLogs.get(ext.id)) || [];
  if (!lines.length) return say(t('  aucune erreur de {name} depuis le lancement', { name: ext.name }), 'dim');
  say(t('  erreurs et avertissements de {name} depuis le lancement :', { name: ext.name }), 'dim');
  for (const l of lines.slice(-30)) say(`  ${new Date(l.time).toLocaleTimeString(getLang() === 'en' ? 'en-US' : 'fr-FR')} [${l.where}] ${l.text}`, 'err');
}

Object.assign(module.exports, { watchWorkerLogs, watchExtensionLogs, extLogCommand });
