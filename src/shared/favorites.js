'use strict';

const { t } = require('./i18n');

// Favoris rangés en arbre : { type: 'folder', name, children: [...] }
// et { type: 'link', name, url, title, addedAt } pour les feuilles.

function emptyTree() {
  return { type: 'folder', name: '', children: [] };
}

function splitPath(path) {
  return String(path || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

function findChild(folder, name) {
  return folder.children.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

// Renvoie le nœud au chemin donné (dossier ou lien), ou null.
function getNode(tree, path) {
  let node = tree;
  for (const part of splitPath(path)) {
    if (!node || node.type !== 'folder') return null;
    node = findChild(node, part);
  }
  return node || null;
}

// Renvoie le dossier au chemin donné, en créant les dossiers manquants si create est vrai.
function getFolder(tree, parts, create) {
  let node = tree;
  for (const part of parts) {
    let next = findChild(node, part);
    if (!next) {
      if (!create) return null;
      next = { type: 'folder', name: part, children: [] };
      node.children.push(next);
    } else if (next.type !== 'folder') {
      throw new Error(t('« {name} » est un favori, pas un dossier', { name: part }));
    }
    node = next;
  }
  return node;
}

// add [dossier/]nom : crée les dossiers qui manquent. Renvoie ce qui a été fait.
function addFavorite(tree, path, url, title) {
  const parts = splitPath(path);
  if (!parts.length) throw new Error(t('il faut un nom : add [dossier/]nom'));
  const name = parts.pop();
  const createdFolders = [];
  let node = tree;
  for (const part of parts) {
    let next = findChild(node, part);
    if (!next) {
      next = { type: 'folder', name: part, children: [] };
      node.children.push(next);
      createdFolders.push(part);
    } else if (next.type !== 'folder') {
      throw new Error(t('« {name} » est un favori, pas un dossier', { name: part }));
    }
    node = next;
  }
  const existing = findChild(node, name);
  if (existing && existing.type === 'folder') throw new Error(t('« {name} » est déjà un dossier', { name }));
  if (existing) {
    existing.url = url;
    existing.title = title || existing.title;
    return { updated: true, createdFolders, path: [...parts, name].join('/') };
  }
  node.children.push({ type: 'link', name, url, title: title || '', addedAt: Date.now() });
  return { updated: false, createdFolders, path: [...parts, name].join('/') };
}

// Supprime un favori ou un dossier entier. Renvoie de quoi annuler.
function removeFavorite(tree, path) {
  const parts = splitPath(path);
  if (!parts.length) throw new Error(t('quel favori supprimer ?'));
  const name = parts.pop();
  const parent = getFolder(tree, parts, false);
  const node = parent && findChild(parent, name);
  if (!node) throw new Error(t('favori introuvable : {path}', { path }));
  const index = parent.children.indexOf(node);
  parent.children.splice(index, 1);
  return { node, parentParts: parts, index };
}

function restoreFavorite(tree, undo) {
  const parent = getFolder(tree, undo.parentParts, true);
  parent.children.splice(Math.min(undo.index, parent.children.length), 0, undo.node);
}

// fav mv src dest : si dest est un dossier (existant ou finissant par /) on déplace dedans,
// sinon dest est le nouveau chemin complet.
function moveFavorite(tree, src, dest) {
  const destIsFolder = /\/$/.test(dest) || (getNode(tree, dest) || {}).type === 'folder';
  const srcKey = splitPath(src).join('/').toLowerCase();
  const destKey = splitPath(dest).join('/').toLowerCase();
  if (destKey === srcKey || destKey.startsWith(`${srcKey}/`)) {
    throw new Error(t('impossible de déplacer un dossier dans lui-même'));
  }
  const removed = removeFavorite(tree, src);
  try {
    let target;
    let name = removed.node.name;
    if (destIsFolder) {
      target = getFolder(tree, splitPath(dest), true);
    } else {
      const parts = splitPath(dest);
      name = parts.pop();
      target = getFolder(tree, parts, true);
    }
    if (findChild(target, name)) throw new Error(t('« {name} » existe déjà à cet endroit', { name }));
    removed.node.name = name;
    target.children.push(removed.node);
    return removed.node;
  } catch (err) {
    restoreFavorite(tree, removed);
    throw err;
  }
}

function renameFavorite(tree, path, newName) {
  if (!newName || newName.includes('/')) throw new Error(t('nouveau nom invalide'));
  const node = getNode(tree, path);
  if (!node || node === tree) throw new Error(t('favori introuvable : {path}', { path }));
  const parent = getFolder(tree, splitPath(path).slice(0, -1), false);
  const clash = findChild(parent, newName);
  if (clash && clash !== node) throw new Error(t('« {name} » existe déjà', { name: newName }));
  node.name = newName;
  return node;
}

// Liste à plat pour l'affichage en arbre : chaque ligne a sa profondeur,
// les liens reçoivent un numéro.
function flatten(folder, prefix = '', depth = 0, out = []) {
  const sorted = [...folder.children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr');
  });
  sorted.forEach((child, i) => {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    const last = i === sorted.length - 1;
    out.push({ type: child.type, name: child.name, path, url: child.url, title: child.title, depth, last });
    if (child.type === 'folder') flatten(child, path, depth + 1, out);
  });
  return out;
}

function allLinks(tree) {
  return flatten(tree).filter((n) => n.type === 'link');
}

function findByUrl(tree, url) {
  if (!url) return null;
  const clean = (u) => u.replace(/#.*$/, '').replace(/\/$/, '');
  return allLinks(tree).find((l) => clean(l.url) === clean(url)) || null;
}

function recent(tree, n) {
  const links = [];
  (function walk(folder, prefix) {
    for (const c of folder.children) {
      const path = prefix ? `${prefix}/${c.name}` : c.name;
      if (c.type === 'folder') walk(c, path);
      else links.push({ ...c, path });
    }
  })(tree, '');
  return links.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, n);
}

function countAll(tree) {
  let links = 0;
  let folders = 0;
  (function walk(f) {
    for (const c of f.children) {
      if (c.type === 'folder') {
        folders++;
        walk(c);
      } else links++;
    }
  })(tree);
  return { links, folders };
}

module.exports = {
  emptyTree,
  splitPath,
  getNode,
  addFavorite,
  removeFavorite,
  restoreFavorite,
  moveFavorite,
  renameFavorite,
  flatten,
  allLinks,
  findByUrl,
  recent,
  countAll,
};
