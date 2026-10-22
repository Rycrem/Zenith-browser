'use strict';

const ai = require('../ai/providers');
const fav = require('../../shared/favorites');
const C = require('../../shared/commands');
const { shortUrl } = require('../../shared/search');
const state = require('../state');

// Autocomplétion avec Tab.
function complete(line) {
  const parts = line.split(' ');
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).filter(Boolean);
  const tree = state.favorites.data.tree;
  const favPaths = () => fav.flatten(tree).map((n) => (n.type === 'folder' ? `${n.path}/` : n.path));
  const folders = () => fav.flatten(tree).filter((n) => n.type === 'folder').map((n) => `${n.path}/`);
  let pool = [];
  if (!head.length) pool = [...C.COMMAND_NAMES, ...Object.keys(state.settings.data.aliases)];
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
  return { line: [...head, word].join(' ') + suffix, options: done ? [] : options.slice(0, 40) };
}

Object.assign(module.exports, { complete });
