'use strict';

// Recalcule l'empreinte et la taille de l'installateur dans latest.yml après sa signature :
// signer modifie le fichier, et electron-updater refuse un installateur dont le sha512 diffère.
// Usage : node scripts/latest-yml.js dist/latest.yml dist/dev-brows-Setup-x.y.z.exe
const crypto = require('crypto');
const fs = require('fs');

const [yml, exe] = process.argv.slice(2);
const data = fs.readFileSync(exe);
const sha512 = crypto.createHash('sha512').update(data).digest('base64');
const text = fs
  .readFileSync(yml, 'utf8')
  .replace(/^(\s*sha512: ).*$/gm, `$1${sha512}`)
  .replace(/^(\s*size: )\d+$/gm, `$1${data.length}`);
fs.writeFileSync(yml, text);
console.log(`${yml} : sha512 ${sha512.slice(0, 16)}…, ${data.length} octets`);
