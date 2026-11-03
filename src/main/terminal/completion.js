'use strict';

const ai = require('../ai/providers');
const fav = require('../../shared/favorites');
const C = require('../../shared/commands');
const { shortUrl } = require('../../shared/search');
const state = require('../state');

// Autocomplétion avec Tab.
function complete(line) {
  const parts = line.split(' ');
  let last = parts[parts.length - 1];
  let head = parts.slice(0, -1).filter(Boolean);
  const tree = state.favorites.data.tree;
  const favPaths = () => fav.flatten(tree).map((n) => (n.type === 'folder' ? `${n.path}/` : n.path));
  const folders = () => fav.flatten(tree).filter((n) => n.type === 'folder').map((n) => `${n.path}/`);
  // Le nom d'un favori s'ouvre tapé seul : il se complète comme une commande, espaces compris.
  const favNames = fav.allLinks(tree).flatMap((l) => [l.name, l.path]);
  if (head.length && !C.COMMAND_NAMES.includes(head[0]) && favNames.some((n) => n.toLowerCase().startsWith(line.toLowerCase()))) {
    last = line;
    head = [];
  }
  let pool = [];
  if (!head.length) pool = [...C.COMMAND_NAMES, ...Object.keys(state.settings.data.aliases), ...favNames];
  else if (head[0] === 'fav' && head.length === 1) pool = [...C.SUBCOMMANDS.fav, ...folders()];
  else if (head[0] === 'fav' && ['rm', 'mv', 'rename'].includes(head[1])) pool = head[1] === 'mv' && head.length === 3 ? folders() : favPaths();
  else if (head[0] === 'add') pool = folders();
  else if (head[0] === 'go' || head[0] === 'split') pool = [...new Set(fav.allLinks(tree).map((l) => shortUrl(l.url)))];
  else if (head[0] === 'unalias') pool = Object.keys(state.settings.data.aliases);
  else if ((head[0] === 'ia' || head[0] === 'ai') && head.length === 2 && ['use', 'connect', 'logout'].includes(head[1])) pool = Object.keys(ai.PROVIDERS);
  else if (head.length === 1 && C.SUBCOMMANDS[head[0]]) pool = C.SUBCOMMANDS[head[0]];
  const options = [...new Set(pool)].filter((p) => p.toLowerCase().startsWith(last.toLowerCase())).sort();
  if (!options.length) return { line, options: [] };
  const done = options.length === 1;
  const word = done ? options[0] : C.commonPrefix(options) || last;
  const suffix = done && !word.endsWith('/') ? ' ' : '';
  // base : ce qui précède le mot complété, pour que Tab fasse défiler les propositions.
  return { line: [...head, word].join(' ') + suffix, base: head.length ? `${head.join(' ')} ` : '', options: done ? [] : options.slice(0, 40) };
}

// Prédiction affichée en gris pendant la frappe : un alias, un favori, puis une page de l'historique
// dont l'adresse commence par le texte (la plus visitée). L'historique des commandes est vu par l'interface.
function predict(text) {
  const q = String(text || '');
  const low = q.toLowerCase();
  if (!q.trim() || /\s$/.test(q)) return '';
  const starts = (s) => s && s.length > q.length && s.toLowerCase().startsWith(low);
  const tree = state.favorites.data.tree;
  const found = Object.keys(state.settings.data.aliases).find(starts)
    || fav.allLinks(tree).map((l) => l.name).find(starts)
    || fav.allLinks(tree).map((l) => l.path).find(starts);
  if (found) return q + found.slice(q.length);
  if (/\s/.test(q)) return '';
  const visits = new Map();
  for (const e of state.history.data.entries) {
    if (!e.url || e.query || !/^https?:/.test(e.url)) continue;
    const bare = e.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    if (starts(bare)) visits.set(bare, (visits.get(bare) || 0) + 1);
  }
  // Le site seul d'abord (« git » → « github.com »), puis l'adresse complète.
  let best = '';
  let score = -1;
  for (const [bare, n] of visits) {
    const site = bare.split('/')[0];
    const cand = starts(site) ? site : bare;
    const s = n + (cand === site ? 1000 : 0);
    if (s > score) {
      score = s;
      best = cand;
    }
  }
  return best ? q + best.slice(q.length) : '';
}

Object.assign(module.exports, { complete, predict });
