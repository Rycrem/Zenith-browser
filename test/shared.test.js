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
  assert.strictEqual(crx.storeExtensionId(`https://chromewebstore.google.com/detail/ublock-origin/${id}?hl=fr`), id);
  assert.strictEqual(crx.storeExtensionId(`https://chrome.google.com/webstore/detail/${id}`), id);
  assert.strictEqual(crx.storeExtensionId(`https://example.com/detail/${id}`), null);
  assert.strictEqual(crx.storeExtensionId('https://chromewebstore.google.com/'), null);
});

test('une commande suivie de mots inattendus devient une recherche', () => {
  assert.strictEqual(cmd.acceptsArgs('home', ['depot']), false);
  assert.strictEqual(cmd.acceptsArgs('close', ['friends']), false);
  assert.strictEqual(cmd.acceptsArgs('close', ['2']), true);
  assert.strictEqual(cmd.acceptsArgs('tab', ['new']), true);
  assert.strictEqual(cmd.acceptsArgs('split', ['off']), true);
  assert.strictEqual(cmd.acceptsArgs('split', ['pea']), false);
  assert.strictEqual(cmd.acceptsArgs('brows', ['chat']), true);
  assert.strictEqual(cmd.acceptsArgs('devtools', ['detach']), true);
});

test('les notes de mise à jour couvrent la version de package.json', () => {
  const { CHANGELOG } = require('../src/shared/changelog');
  const { version } = require('../package.json');
  assert.strictEqual(CHANGELOG[0].version, version);
  assert.ok(CHANGELOG[0].notes.length > 0);
});

test('les notes de mise à jour existent en anglais, autant qu\'en français', () => {
  const { CHANGELOG, notesFor } = require('../src/shared/changelog');
  for (const e of CHANGELOG) assert.strictEqual((e.en || []).length, e.notes.length, e.version);
  assert.deepStrictEqual(notesFor(CHANGELOG[0].version, 'en').notes, CHANGELOG[0].en);
  assert.deepStrictEqual(notesFor('0.0.0').notes, CHANGELOG[0].notes);
});

test('t traduit en anglais, remplace les variables et revient au français', () => {
  const i18n = require('../src/shared/i18n');
  try {
    assert.strictEqual(i18n.t('aucun résultat'), 'aucun résultat');
    i18n.setLang('en');
    assert.strictEqual(i18n.getLang(), 'en');
    assert.strictEqual(i18n.t('aucun résultat'), 'no results');
    assert.strictEqual(i18n.t('pas de numéro {n} ici (1 à {max})', { n: 7, max: 3 }), 'no number 7 here (1 to 3)');
    assert.strictEqual(i18n.t('phrase sans traduction {x}', { x: 1 }), 'phrase sans traduction 1');
    assert.throws(() => fav.addFavorite(fav.emptyTree(), '', 'x'), /a name is needed/);
    i18n.setLang('de');
    assert.strictEqual(i18n.getLang(), 'fr');
  } finally {
    i18n.setLang('fr');
  }
});

test('chaque phrase passée à t() a sa traduction anglaise', () => {
  const { EN } = require('../src/shared/i18n');
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') && !p.endsWith('i18n.js')) files.push(p);
    }
  };
  walk(path.join(__dirname, '..', 'src'));
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:t|tr|mark)\('((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\(.)/g, '$1');
      if (!Object.prototype.hasOwnProperty.call(EN, key)) missing.push(`${path.basename(f)} : ${key}`);
    }
  }
  for (const [, args, desc] of cmd.COMMANDS) {
    for (const key of [args, desc]) if (key && !Object.prototype.hasOwnProperty.call(EN, key)) missing.push(`commands.js : ${key}`);
  }
  assert.deepStrictEqual(missing, []);
});

test('notes d\'une Release GitHub : section de la langue, sinon les puces', () => {
  const { releaseNotes } = require('../src/shared/changelog');
  const body = '### Français\n\n- Nouveau A\n\n### English\n\n- New A\n\n## What\'s Changed\n* Titre de PR by @Rycrem in https://github.com/Rycrem/dev-brows/pull/19\n';
  assert.deepStrictEqual(releaseNotes(body, 'fr'), ['Nouveau A']);
  assert.deepStrictEqual(releaseNotes(body, 'en'), ['New A']);
  const old = '## What\'s Changed\n* README : remettre l\'installation by @Rycrem in https://github.com/Rycrem/dev-brows/pull/19\n\n**Full Changelog**: https://x';
  assert.deepStrictEqual(releaseNotes(old, 'en'), ['README : remettre l\'installation']);
  assert.deepStrictEqual(releaseNotes('', 'fr'), []);
});
