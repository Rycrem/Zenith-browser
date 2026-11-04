'use strict';

// Signature VMP de castLabs, sans laquelle Widevine refuse Netflix (erreur M7701-1003).
// Windows : après la signature Authenticode (afterSign). macOS : avant la signature Apple (afterPack).
// Il faut avoir lancé « python -m castlabs_evs.account reauth » avant (compte castLabs EVS gratuit).
// Linux n'en a pas besoin.

const { spawnSync } = require('child_process');

function sign(appOutDir) {
  if (!process.env.EVS_ACCOUNT_NAME) {
    console.warn('  • signature VMP ignorée : pas de compte castLabs EVS (EVS_ACCOUNT_NAME), Netflix ne marchera pas');
    return;
  }
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const r = spawnSync(python, ['-m', 'castlabs_evs.vmp', 'sign-pkg', appOutDir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`signature VMP impossible (code ${r.status})`);
}

async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;
  // Les fuses modifient le binaire juste après afterPack : on les pose d'abord pour que la signature VMP reste valable.
  const fuses = packager.config.electronFuses;
  if (fuses) await packager.addElectronFuses(context, await packager.generateFuseConfig(fuses));
  sign(appOutDir);
}

async function afterSign(context) {
  if (context.electronPlatformName === 'win32') sign(context.appOutDir);
}

module.exports = { sign, afterPack, afterSign };
