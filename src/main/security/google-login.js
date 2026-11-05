'use strict';

const { app } = require('electron');

// La connexion Google refuse les navigateurs basés sur Electron (« Ce navigateur ou cette application
// ne sont peut-être pas sécurisés »). Sur accounts.google.com seulement, on se présente comme Firefox :
// en-tête User-Agent, navigator.userAgent, et sans les en-têtes Sec-CH-UA propres à Chromium.
const GOOGLE_LOGIN = 'accounts.google.com';
function firefoxUserAgent() {
  // Firefox sort une version toutes les 4 semaines (140 le 24 juin 2025) ; on annonce l'avant-dernière.
  const version = 140 + Math.floor((Date.now() - Date.UTC(2025, 5, 24)) / (28 * 24 * 3600 * 1000)) - 1;
  const platform = {
    win32: 'Windows NT 10.0; Win64; x64',
    darwin: 'Macintosh; Intel Mac OS X 10.15',
  }[process.platform] || 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
}
const isGoogleLogin = (url) => {
  try {
    return new URL(url).hostname === GOOGLE_LOGIN;
  } catch {
    return false;
  }
};

// Le filtre d'en-têtes n'est posé que pendant une connexion Google, et seulement sur la session
// concernée (onglets, navigation privée, applis de discussion) : tant qu'un filtre
// session.webRequest existe, Electron ignore le chrome.webRequest des extensions.
const onGoogleLogin = new Map(); // session -> ids des webContents sur accounts.google.com

function setGoogleFilter(ses, id, on) {
  const ids = onGoogleLogin.get(ses) || new Set();
  const before = ids.size;
  if (on) ids.add(id);
  else ids.delete(id);
  if (ids.size) onGoogleLogin.set(ses, ids);
  else onGoogleLogin.delete(ses);
  if (!before && ids.size) {
    const ua = firefoxUserAgent();
    ses.webRequest.onBeforeSendHeaders({ urls: [`https://${GOOGLE_LOGIN}/*`] }, (details, callback) => {
      const headers = details.requestHeaders;
      for (const name of Object.keys(headers)) if (/^sec-ch-ua/i.test(name)) delete headers[name];
      headers['User-Agent'] = ua;
      callback({ requestHeaders: headers });
    });
  } else if (before && !ids.size) {
    ses.webRequest.onBeforeSendHeaders(null);
  }
}

function matchUserAgent(wc, url) {
  const ua = isGoogleLogin(url) ? firefoxUserAgent() : app.userAgentFallback;
  if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
}

// Tous les webContents : onglets, popups de connexion OAuth, applis de discussion (Google Messages).
function setupGoogleLogin() {
  app.on('web-contents-created', (e, wc) => {
    const id = wc.id;
    const ses = wc.session;
    const follow = (url) => setGoogleFilter(ses, id, isGoogleLogin(url));
    wc.on('did-start-navigation', (d) => {
      if (!d.isMainFrame) return;
      matchUserAgent(wc, d.url);
      follow(d.url);
    });
    // Pas de setUserAgent pendant une redirection (site -> accounts.google.com) : Chromium rechargerait
    // la page de départ et la connexion reviendrait aussitôt au bouton « Se connecter avec Google ».
    // Le filtre d'en-têtes suffit à présenter Firefox à Google.
    wc.on('will-redirect', (d) => d.isMainFrame && follow(d.url));
    wc.once('destroyed', () => setGoogleFilter(ses, id, false));
  });
}

Object.assign(module.exports, { setupGoogleLogin, isGoogleLogin, firefoxUserAgent });
