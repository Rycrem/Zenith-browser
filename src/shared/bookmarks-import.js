'use strict';

// Import des favoris d'un autre navigateur : fichier Bookmarks (JSON) des navigateurs
// Chromium, sauvegarde .jsonlz4 de Firefox, ou export HTML (format Netscape, que tous savent faire).
// Tout est converti en nœuds { type: 'folder', name, children } / { type: 'link', name, url, title, addedAt }.

const OK_URL = /^(https?|ftp|file):/i;

// Un nom ne peut pas contenir « / » : c'est le séparateur des chemins de favoris.
const cleanName = (s, fallback) => String(s || '').replace(/\//g, '-').replace(/\s+/g, ' ').trim() || fallback;

function link(name, url, addedAt) {
  return { type: 'link', name: cleanName(name, url), url, title: String(name || ''), addedAt: addedAt || Date.now() };
}

// Chromium : dates en microsecondes depuis 1601.
function chromiumTime(v) {
  const n = Number(v);
  return n ? Math.round(n / 1000 - 11644473600000) : 0;
}

function fromChromium(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const convert = (node) => {
    if (node.type === 'url') return OK_URL.test(node.url || '') ? link(node.name, node.url, chromiumTime(node.date_added)) : null;
    if (node.type !== 'folder') return null;
    return { type: 'folder', name: cleanName(node.name, '?'), children: (node.children || []).map(convert).filter(Boolean) };
  };
  const roots = data && data.roots;
  if (!roots) throw new Error('not a Bookmarks file');
  // La barre de favoris passe directement à la racine ; les autres racines gardent leur dossier.
  const out = [];
  for (const key of ['bookmark_bar', 'other', 'synced']) {
    if (!roots[key]) continue;
    const folder = convert(roots[key]);
    if (!folder || !folder.children.length) continue;
    if (key === 'bookmark_bar') out.push(...folder.children);
    else out.push(folder);
  }
  return out;
}

function fromFirefox(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const convert = (node) => {
    if (node.type === 'text/x-moz-place') return OK_URL.test(node.uri || '') ? link(node.title, node.uri, node.dateAdded ? Math.round(node.dateAdded / 1000) : 0) : null;
    if (node.type !== 'text/x-moz-place-container') return null;
    return { type: 'folder', name: cleanName(node.title, '?'), children: (node.children || []).map(convert).filter(Boolean) };
  };
  if (!data || !Array.isArray(data.children)) throw new Error('not a Firefox bookmarks backup');
  const out = [];
  for (const root of data.children) {
    const folder = convert(root);
    if (!folder || !folder.children.length) continue;
    // Barre personnelle à la racine, les autres (menu, non classés, mobile) dans leur dossier.
    if (root.root === 'toolbarFolder') out.push(...folder.children);
    else out.push({ ...folder, name: { bookmarksMenuFolder: 'Menu', unfiledBookmarksFolder: 'Autres', mobileFolder: 'Mobile' }[root.root] || folder.name });
  }
  return out;
}

// Décompression LZ4 (bloc) des fichiers « mozLz40\0 » de Firefox.
function mozLz4(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 8) !== 'mozLz40\0') throw new Error('not a mozlz4 file');
  const size = buf.readUInt32LE(8);
  const out = Buffer.alloc(size);
  let i = 12;
  let o = 0;
  while (i < buf.length) {
    const token = buf[i++];
    let lit = token >> 4;
    if (lit === 15) for (let b = 255; b === 255 && i < buf.length;) lit += b = buf[i++];
    buf.copy(out, o, i, i + lit);
    i += lit;
    o += lit;
    if (i >= buf.length) break;
    const offset = buf[i] | (buf[i + 1] << 8);
    i += 2;
    if (!offset || offset > o) throw new Error('corrupt mozlz4 file');
    let len = (token & 15) + 4;
    if ((token & 15) === 15) for (let b = 255; b === 255 && i < buf.length;) len += b = buf[i++];
    if (o + len > size) throw new Error('corrupt mozlz4 file');
    for (let k = 0; k < len; k++, o++) out[o] = out[o - offset];
  }
  return out.subarray(0, o);
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');

// Export HTML (NETSCAPE-Bookmark-file-1) : <DT><H3>dossier</H3><DL>…</DL>, <DT><A HREF="…">nom</A>.
function fromHtml(html) {
  const root = { type: 'folder', name: '', children: [] };
  const stack = [root];
  let pending = null; // dossier dont le <DL> va s'ouvrir
  const re = /<(\/?)(DL|H3|A)\b([^>]*)>([^<]*)/gi;
  let m;
  let seen = false;
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, text] = m;
    const T = tag.toUpperCase();
    const cur = stack[stack.length - 1];
    if (T === 'DL') {
      if (close) {
        if (stack.length > 1) stack.pop();
      } else if (pending) {
        stack.push(pending);
        pending = null;
      }
    } else if (T === 'H3' && !close) {
      seen = true;
      pending = { type: 'folder', name: cleanName(decode(text), '?'), children: [] };
      cur.children.push(pending);
    } else if (T === 'A' && !close) {
      seen = true;
      const href = /HREF="([^"]*)"/i.exec(attrs);
      const added = /ADD_DATE="(\d+)"/i.exec(attrs);
      const url = href ? decode(href[1]) : '';
      if (OK_URL.test(url)) cur.children.push(link(decode(text), url, added ? Number(added[1]) * 1000 : 0));
    }
  }
  if (!seen) throw new Error('no bookmarks in this file');
  const prune = (f) => {
    f.children = f.children.filter((c) => c.type === 'link' || (prune(c), c.children.length));
    return f;
  };
  return prune(root).children;
}

// Ajoute les nœuds dans le dossier `folder` de l'arbre (créé au besoin), sans les adresses déjà présentes.
function mergeInto(tree, folder, nodes) {
  const known = new Set();
  (function walk(f) {
    for (const c of f.children) c.type === 'folder' ? walk(c) : known.add(c.url);
  })(tree);
  let target = tree.children.find((c) => c.type === 'folder' && c.name.toLowerCase() === folder.toLowerCase());
  if (!target) {
    target = { type: 'folder', name: folder, children: [] };
    tree.children.push(target);
  }
  const stats = { added: 0, skipped: 0 };
  const add = (dest, list) => {
    for (const n of list) {
      if (n.type === 'link') {
        if (known.has(n.url)) {
          stats.skipped++;
          continue;
        }
        known.add(n.url);
        let name = n.name;
        for (let k = 2; dest.children.some((c) => c.name.toLowerCase() === name.toLowerCase()); k++) name = `${n.name} (${k})`;
        dest.children.push({ ...n, name });
        stats.added++;
      } else {
        let sub = dest.children.find((c) => c.type === 'folder' && c.name.toLowerCase() === n.name.toLowerCase());
        if (!sub) {
          sub = { type: 'folder', name: n.name, children: [] };
          dest.children.push(sub);
        }
        add(sub, n.children);
      }
    }
  };
  add(target, nodes);
  // Un dossier resté vide (tout était déjà là) ne sert à rien.
  const prune = (f) => {
    f.children = f.children.filter((c) => c.type === 'link' || (prune(c), c.children.length));
  };
  prune(target);
  if (!target.children.length) tree.children.splice(tree.children.indexOf(target), 1);
  return stats;
}

module.exports = { fromChromium, fromFirefox, fromHtml, mozLz4, mergeInto };
