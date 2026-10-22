'use strict';

// Ouvre une session SimplySign (certificat Certum dans le cloud) sur un runner Windows de
// GitHub Actions, pour que signtool trouve le certificat dans le magasin Windows.
// Installe SimplySign Desktop, remplit sa fenêtre de connexion (identifiant + code TOTP),
// puis écrit l'empreinte SHA-1 du certificat dans la sortie « thumbprint » de l'étape.
// Variables : CERTUM_USERNAME, CERTUM_TOTP_SECRET (secret Base32 ou lien otpauth:// complet).
const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = '9.4.4.92';
const MSI_URL = `https://files.certum.eu/software/SimplySignDesktop/Windows/${VERSION}/SimplySignDesktop-${VERSION}-64-bit-en.msi`;
const APP = 'C:\\Program Files\\Certum\\SimplySign Desktop\\SimplySignDesktop.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps(code) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { encoding: 'utf8' });
}

// Le secret peut être collé seul ou avec tout le lien otpauth:// du QR code d'activation.
function parseSecret(raw) {
  if (!raw.startsWith('otpauth://')) return { secret: raw, algorithm: 'sha256', digits: 6, period: 30 };
  const q = new URL(raw).searchParams;
  return {
    secret: q.get('secret'),
    algorithm: (q.get('algorithm') || 'SHA256').toLowerCase().replace('-', ''),
    digits: Number(q.get('digits') || 6),
    period: Number(q.get('period') || 30),
  };
}

function base32(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of s.toUpperCase().replace(/[\s=-]/g, '')) {
    const i = alphabet.indexOf(c);
    if (i < 0) throw new Error('secret TOTP invalide (Base32 attendu)');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp({ secret, algorithm, digits, period }) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / period)));
  const h = crypto.createHmac(algorithm, base32(secret)).update(counter).digest();
  const n = h.readUInt32BE(h[h.length - 1] & 0x0f) & 0x7fffffff;
  return String(n % 10 ** digits).padStart(digits, '0');
}

const windowOpen = () => ps(`(Get-Process | Where-Object { $_.MainWindowTitle -like '*SimplySign*' }).Count`).trim() !== '0';

function focus() {
  ps(`$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*SimplySign*' } | Select-Object -First 1
if ($p) { (New-Object -ComObject wscript.shell).AppActivate($p.Id) | Out-Null }`);
}

// SendKeys : + ^ % ~ ( ) { } [ ] ont un sens spécial et doivent être entourés d'accolades.
function type(text) {
  const keys = text.replace(/([+^%~(){}[\]])/g, '{$1}').replace(/'/g, "''");
  ps(`(New-Object -ComObject wscript.shell).SendKeys('${keys}')`);
}

async function main() {
  const user = process.env.CERTUM_USERNAME;
  const otp = parseSecret(process.env.CERTUM_TOTP_SECRET || '');
  if (!user || !otp.secret) throw new Error('CERTUM_USERNAME et CERTUM_TOTP_SECRET sont requis');
  console.log(`::add-mask::${otp.secret}`);

  if (!fs.existsSync(APP)) {
    const msi = path.join(process.env.RUNNER_TEMP || '.', 'SimplySignDesktop.msi');
    const res = await fetch(MSI_URL);
    if (!res.ok) throw new Error(`Certum : ${res.status} sur ${MSI_URL}`);
    fs.writeFileSync(msi, Buffer.from(await res.arrayBuffer()));
    execFileSync('msiexec', ['/i', msi, '/qn', '/norestart'], { stdio: 'inherit' });
  }

  // Le premier lancement démarre le service, le second ouvre la fenêtre de connexion.
  for (let i = 0; i < 5 && !windowOpen(); i++) {
    spawn(APP, [], { detached: true, stdio: 'ignore' }).unref();
    await sleep(3000);
  }
  if (!windowOpen()) throw new Error("la fenêtre de connexion SimplySign ne s'est pas ouverte");

  for (let attempt = 1; attempt <= 2 && windowOpen(); attempt++) {
    // Pas de code qui expire pendant la saisie.
    const left = otp.period - (Math.floor(Date.now() / 1000) % otp.period);
    if (left < 10) await sleep((left + 1) * 1000);
    const code = totp(otp);
    console.log(`::add-mask::${code}`);
    focus();
    await sleep(500);
    ps(`(New-Object -ComObject wscript.shell).SendKeys('^a')`);
    type(user);
    ps(`(New-Object -ComObject wscript.shell).SendKeys('{TAB}^a')`);
    type(code);
    focus();
    ps(`(New-Object -ComObject wscript.shell).SendKeys('{ENTER}')`);
    for (let i = 0; i < 10 && windowOpen(); i++) await sleep(2000);
  }
  if (windowOpen()) throw new Error('connexion SimplySign refusée (identifiant ou secret TOTP faux ?)');

  // Le certificat apparaît dans le magasin quelques secondes après la connexion.
  for (let i = 0; i < 30; i++) {
    const thumb = ps(`Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.Issuer -like '*Certum*' -and ($_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3') } | Select-Object -First 1 -ExpandProperty Thumbprint`).trim();
    if (thumb) {
      console.log(`Certificat Certum trouvé : ${thumb}`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `thumbprint=${thumb}\n`);
      return;
    }
    await sleep(3000);
  }
  throw new Error("aucun certificat Certum de signature de code dans le magasin Windows après la connexion");
}

main().catch((e) => {
  console.error(`::error::SimplySign : ${e.message}`);
  process.exit(1);
});
