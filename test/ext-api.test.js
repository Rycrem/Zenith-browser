'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { bookmarkTree } = require('../src/main/ext-api');

test('les favoris deviennent un arbre chrome.bookmarks', () => {
  const tree = {
    type: 'folder',
    name: '',
    children: [
      { type: 'link', name: 'Wiki', url: 'https://fr.wikipedia.org/', addedAt: 5 },
      { type: 'folder', name: 'Dev', children: [{ type: 'link', name: 'MDN', url: 'https://developer.mozilla.org/', addedAt: 9 }] },
    ],
  };
  const { root, nodes } = bookmarkTree(tree);
  assert.strictEqual(root.id, '0');
  const bar = root.children[0];
  assert.strictEqual(bar.id, '1');
  assert.deepStrictEqual(bar.children.map((c) => c.title), ['Wiki', 'Dev']);
  const mdn = bar.children[1].children[0];
  assert.strictEqual(mdn.url, 'https://developer.mozilla.org/');
  assert.strictEqual(mdn.parentId, bar.children[1].id);
  assert.strictEqual(nodes.get(mdn.id), mdn);
});
