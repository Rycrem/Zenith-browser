'use strict';

const { app } = require('electron');
const state = require('../state');

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

// Le filtre d'en-têtes n'est posé que pendant une connexion Google : tant qu'un filtre
// session.webRequest existe, Electron ignore le
// chrome.webRequest des extensions.
const onGoogleLogin = new Set();

function setGoogleFilter(id, on) {
  const before = onGoogleLogin.size;
  if (on) onGoogleLogin.add(id);
  else onGoogleLogin.delete(id);
  if (!before && onGoogleLogin.size) {
    const ua = firefoxUserAgent();
    for (const s of [state.ses, state.privSes].filter(Boolean)) {
      s.webRequest.onBeforeSendHeaders({ urls: [`https://${GOOGLE_LOGIN}/*`] }, (details, callback) => {
        const headers = details.requestHeaders;
        for (const name of Object.keys(headers)) if (/^sec-ch-ua/i.test(name)) delete headers[name];
        headers['User-Agent'] = ua;
        callback({ requestHeaders: headers });
      });
    }
  } else if (before && !onGoogleLogin.size) {
    for (const s of [state.ses, state.privSes].filter(Boolean)) s.webRequest.onBeforeSendHeaders(null);
  }
}

function matchUserAgent(wc, url) {
  const ua = isGoogleLogin(url) ? firefoxUserAgent() : app.userAgentFallback;
  if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
}

// Onglets et fenêtres de connexion (popups OAuth comprises).
function setupGoogleLogin() {
  app.on('web-contents-created', (e, wc) => {
    const id = wc.id;
    const follow = (url) => setGoogleFilter(id, isGoogleLogin(url));
    wc.on('did-start-navigation', (d) => d.isMainFrame && follow(d.url));
    wc.on('will-redirect', (d) => d.isMainFrame && follow(d.url));
    wc.once('destroyed', () => setGoogleFilter(id, false));
  });
}

Object.assign(module.exports, { matchUserAgent, setupGoogleLogin });
