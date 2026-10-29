'use strict';

const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { t } = require('../../shared/i18n');
const state = require('../state');
const tabList = require('../tabs/tabs');

// Adresses passées par le système (Zenith navigateur par défaut, lien ou page .html ouverts depuis une autre appli).
const urlsIn = (argv) => argv.flatMap((a) => {
  if (/^https?:\/\//i.test(a)) return [a];
  return /\.html?$/i.test(a) && path.isAbsolute(a) && fs.existsSync(a) ? [pathToFileURL(a).href] : [];
});

function openExternalUrls(argv) {
  const urls = urlsIn(argv);
  if (!urls.length || !state.win) return;
  for (const url of urls) tabList.createTab({ url });
  if (state.win.isMinimized()) state.win.restore();
  state.win.focus();
}

// Windows ne laisse pas une appli se déclarer navigateur par défaut : on l'inscrit comme navigateur
// (clés du registre de l'utilisateur), puis on ouvre la page des applis par défaut où la choisir.
async function registerWindowsBrowser() {
  const { execFile } = require('child_process');
  const exe = process.execPath;
  const reg = (key, name, value) => new Promise((resolve, reject) => {
    const args = ['add', `HKCU\\Software\\${key}`, ...(name ? ['/v', name] : ['/ve']), '/d', value, '/f'];
    execFile('reg', args, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
  const base = 'Clients\\StartMenuInternet\\Zenith';
  await reg(base, null, 'Zenith');
  await reg(`${base}\\DefaultIcon`, null, `"${exe}",0`);
  await reg(`${base}\\shell\\open\\command`, null, `"${exe}"`);
  await reg(`${base}\\Capabilities`, 'ApplicationName', 'Zenith');
  await reg(`${base}\\Capabilities`, 'ApplicationDescription', t('Navigateur qui se pilote comme un terminal'));
  await reg(`${base}\\Capabilities`, 'ApplicationIcon', `"${exe}",0`);
  await reg(`${base}\\Capabilities\\StartMenu`, 'StartMenuInternet', 'Zenith');
  for (const p of ['http', 'https']) await reg(`${base}\\Capabilities\\URLAssociations`, p, 'ZenithURL');
  for (const ext of ['.htm', '.html']) await reg(`${base}\\Capabilities\\FileAssociations`, ext, 'ZenithHTML');
  await reg('RegisteredApplications', 'Zenith', `Software\\${base}\\Capabilities`);
  for (const cls of ['ZenithURL', 'ZenithHTML']) {
    await reg(`Classes\\${cls}`, null, cls === 'ZenithURL' ? 'Zenith URL' : 'Zenith HTML');
    if (cls === 'ZenithURL') await reg(`Classes\\${cls}`, 'URL Protocol', '');
    await reg(`Classes\\${cls}\\DefaultIcon`, null, `"${exe}",0`);
    // « -- » : ce qui suit est une adresse, jamais une option de lancement glissée dans un lien.
    await reg(`Classes\\${cls}\\shell\\open\\command`, null, `"${exe}" -- "%1"`);
    await reg(`Classes\\${cls}\\Application`, 'ApplicationName', 'Zenith');
    await reg(`Classes\\${cls}\\Application`, 'ApplicationIcon', `"${exe}",0`);
  }
  for (const ext of ['.htm', '.html']) await reg(`Classes\\${ext}\\OpenWithProgids`, 'ZenithHTML', '');
}

async function defaultCommand(say) {
  if (!app.isPackaged) throw new Error(t('seulement pour Zenith installé, pas lancé depuis le code'));
  if (process.platform === 'win32') {
    await registerWindowsBrowser();
    await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Zenith');
    say(t('  ✓ Zenith est inscrit comme navigateur : choisis-le dans la page des applications par défaut qui vient de s\'ouvrir'), 'ok');
    return;
  }
  const ok = app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https');
  say(ok ? t('  ✓ Zenith est maintenant le navigateur par défaut') : t('  le système a refusé : choisis Zenith dans ses réglages des applications par défaut'), ok ? 'ok' : 'warn');
}

Object.assign(module.exports, { urlsIn, openExternalUrls, defaultCommand });
