'use strict';

// Télécharge la dernière version Chromium de uBlock Origin (github.com/gorhill/uBlock)
// dans vendor/ublock-origin, pour la livrer préinstallée avec l'appli.
// Usage : node scripts/fetch-ublock.js [version]
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const OUT = path.join(__dirname, '..', 'vendor', 'ublock-origin');

async function main() {
  const tag = process.argv[2];
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dev-brows' };
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/gorhill/uBlock/releases/${tag ? `tags/${tag}` : 'latest'}`;
  const rel = await fetch(api, { headers });
  if (!rel.ok) throw new Error(`GitHub : ${rel.status} sur ${api}`);
  const { tag_name: version, assets = [] } = await rel.json();
  const asset = assets.find((a) => /chromium\.zip$/.test(a.name));
  if (!asset) throw new Error(`pas d'archive Chromium dans uBlock Origin ${version}`);
  const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'dev-brows' } });
  if (!res.ok) throw new Error(`téléchargement refusé (${res.status})`);
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  // L'archive met tout dans « uBlock0.chromium/ » : on enlève ce dossier.
  for (const entry of zip.getEntries()) {
    const rel = entry.entryName.replace(/^[^/]+\//, '');
    const target = path.resolve(OUT, rel);
    if (!rel || !target.startsWith(OUT + path.sep)) continue;
    if (entry.isDirectory) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }
  }
  if (!fs.existsSync(path.join(OUT, 'manifest.json'))) throw new Error('manifest.json absent de l\'archive');
  console.log(`uBlock Origin ${version} → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
