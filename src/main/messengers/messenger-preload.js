'use strict';

const { contextBridge } = require('electron');

// Les pages de connexion (Discord, Google) demandent une clé d'accès en douce (mediation « conditional »)
// dès leur chargement. Sous Windows, Electron ouvre alors la fenêtre Sécurité Windows, même quand l'appli
// tourne en fond au lancement. Cette demande est donc ignorée ; le bouton « clé d'accès » du site marche toujours.
contextBridge.executeInMainWorld({
  func: () => {
    const P = globalThis.PublicKeyCredential;
    if (P) {
      P.isConditionalMediationAvailable = () => Promise.resolve(false);
      if (P.getClientCapabilities) {
        const caps = P.getClientCapabilities.bind(P);
        P.getClientCapabilities = () => caps().then((c) => ({ ...c, conditionalGet: false, conditionalCreate: false }));
      }
    }
    const creds = navigator.credentials;
    if (!creds) return;
    const get = creds.get.bind(creds);
    creds.get = (o) => {
      if (!o || o.mediation !== 'conditional') return get(o);
      // Comme un Chrome où l'on ne choisit aucune clé : rien, sauf si le site abandonne la demande.
      return new Promise((resolve, reject) => {
        if (o.signal) o.signal.addEventListener('abort', () => reject(o.signal.reason || new DOMException('Abandon', 'AbortError')), { once: true });
      });
    };
  },
});
