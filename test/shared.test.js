'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const fav = require('../src/shared/favorites');
const cmd = require('../src/shared/commands');
const search = require('../src/shared/search');
const crx = require('../src/shared/crx');

test('add crée les dossiers manquants', () => {
  const t = fav.emptyTree();
  const r = fav.addFavorite(t, 'cuisine/desserts/crepes', 'https://a.fr', 'Crêpes');
  assert.deepStrictEqual(r.createdFolders, ['cuisine', 'desserts']);
  assert.strictEqual(fav.getNode(t, 'cuisine/desserts/crepes').url, 'https://a.fr');
  const again = fav.addFavorite(t, 'cuisine/desserts/crepes', 'https://b.fr');
  assert.strictEqual(again.updated, true);
  assert.strictEqual(fav.allLinks(t).length, 1);
});

test('add sans dossier et refus des chemins vides', () => {
  const t = fav.emptyTree();
  fav.addFavorite(t, 'github', 'https://github.com');
  assert.strictEqual(fav.getNode(t, 'github').type, 'link');
  assert.throws(() => fav.addFavorite(t, '  /  ', 'x'));
  assert.throws(() => fav.addFavorite(t, 'github/x', 'x'), /pas un dossier/);
});

test('rm puis undo remet le favori à sa place', () => {
  const t = fav.emptyTree();
  fav.addFavorite(t, 'dev/a', 'https://a');
  fav.addFavorite(t, 'dev/b', 'https://b');
  const undo = fav.removeFavorite(t, 'dev/a');
  assert.strictEqual(fav.getNode(t, 'dev/a'), null);
  fav.restoreFavorite(t, undo);
  assert.strictEqual(fav.getNode(t, 'dev').children[0].name, 'a');
  assert.throws(() => fav.removeFavorite(t, 'nope'), /introuvable/);
});

test('mv dans un dossier, mv avec renommage, et pas dans soi-même', () => {
  const t = fav.emptyTree();
  fav.addFavorite(t, 'dev/github', 'https://github.com');
  fav.moveFavorite(t, 'dev/github', 'perso/');
  assert.ok(fav.getNode(t, 'perso/github'));
  fav.moveFavorite(t, 'perso/github', 'travail/gh');
  assert.ok(fav.getNode(t, 'travail/gh'));
  assert.throws(() => fav.moveFavorite(t, 'travail', 'travail/sous/'), /lui-même/);
  assert.ok(fav.getNode(t, 'travail/gh'));
});

test('rename et flatten trié dossiers d\'abord', () => {
  const t = fav.emptyTree();
  fav.addFavorite(t, 'zz', 'https://z');
  fav.addFavorite(t, 'dev/mdn', 'https://m');
  fav.renameFavorite(t, 'dev/mdn', 'docs');
  const flat = fav.flatten(t);
  assert.deepStrictEqual(flat.map((n) => n.path), ['dev', 'dev/docs', 'zz']);
  assert.strictEqual(fav.findByUrl(t, 'https://m/').path, 'dev/docs');
});

test('alias et découpage des commandes', () => {
  assert.deepStrictEqual(cmd.tokenize('fav mv "mes trucs/a" b'), ['fav', 'mv', 'mes trucs/a', 'b']);
  assert.strictEqual(cmd.expandAlias('yt chats', { yt: 'brows youtube' }), 'brows youtube chats');
  assert.strictEqual(cmd.expandAlias('fav', { yt: 'x' }), 'fav');
});

test('reconnaissance des adresses', () => {
  for (const s of ['github.com', 'https://x.y', 'localhost:3000', 'fr.wikipedia.org/wiki/Crêpe', '192.168.1.1']) {
    assert.ok(cmd.looksLikeUrl(s), s);
  }
  for (const s of ['recette crêpes', 'fav', 'hello']) assert.ok(!cmd.looksLikeUrl(s), s);
  assert.strictEqual(cmd.normalizeUrl('github.com'), 'https://github.com');
  assert.strictEqual(cmd.normalizeUrl('localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(cmd.commonPrefix(['fav', 'find']), 'f');
});

test('lecture des résultats DuckDuckGo', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/ddg.html'), 'utf8');
  const results = search.parseDuckDuckGoHtml(html);
  assert.strictEqual(results.length, 2);
  assert.deepStrictEqual(results[0], {
    title: 'Pâte à crêpes : la recette facile',
    url: 'https://www.marmiton.org/recettes/pate-a-crepes',
    desc: 'Farine, œufs & lait.',
  });
  assert.strictEqual(results[1].url, 'https://fr.wikipedia.org/wiki/Crêpe');
  assert.deepStrictEqual(search.parseNextPage(html), { q: 'recette crêpes', s: '10', dc: '11' });
});

test('crx3 vers zip et identifiant d\'extension', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  const header = Buffer.alloc(12);
  header.write('Cr24', 0, 'ascii');
  header.writeUInt32LE(3, 4);
  header.writeUInt32LE(5, 8);
  const file = Buffer.concat([header, Buffer.alloc(5), zip]);
  assert.deepStrictEqual(crx.crxToZip(file), zip);
  assert.throws(() => crx.crxToZip(Buffer.from('nope nope nope nope')));
  const id = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';
  assert.strictEqual(crx.extensionIdFrom(`https://chromewebstore.google.com/detail/ublock-origin/${id}`), id);
  assert.strictEqual(crx.extensionIdFrom(id), id);
  assert.strictEqual(crx.extensionIdFrom('ublock'), null);
});
