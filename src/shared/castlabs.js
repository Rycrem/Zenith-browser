'use strict';

// Electron de castLabs (avec Widevine, pour Netflix) : publié en tags git « vX.Y.Z+wvcus »,
// pas sur npm. Sert à « update » quand l'appli tourne depuis le code.
const CASTLABS_REPO = 'https://github.com/castlabs/electron-releases';

const parse = (v) => String(v).replace(/^v/, '').replace(/\+wvcus$/, '').split('.').map(Number);

function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Versions stables (sans alpha ni beta) trouvées dans la sortie de « git ls-remote --tags », triées.
function castlabsVersions(lsRemote) {
  const found = new Set();
  for (const m of String(lsRemote).matchAll(/refs\/tags\/v(\d+\.\d+\.\d+)\+wvcus\r?$/gm)) found.add(m[1]);
  return [...found].sort(compare);
}

// Dernière version de la même majeure que current, et dernière tout court.
function pickCastlabs(versions, current) {
  const major = parse(current)[0];
  const same = versions.filter((v) => parse(v)[0] === major);
  return { sameMajor: same[same.length - 1] || null, latest: versions[versions.length - 1] || null };
}

const castlabsSpec = (version) => `electron@${CASTLABS_REPO}#v${version}+wvcus`;

module.exports = { CASTLABS_REPO, castlabsVersions, pickCastlabs, castlabsSpec, compare };
