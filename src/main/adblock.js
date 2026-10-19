'use strict';

const fs = require('fs');
const { net } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

// Bloqueur de pub intégré (moteur de Ghostery, listes EasyList et EasyPrivacy) :
// il marche sans extension, là où Electron ne fait pas tourner uBlock Origin.
// Ses listes sont gardées en cache et retéléchargées une fois par semaine.
const MAX_AGE = 7 * 24 * 3600 * 1000;

class AdBlock {
  constructor(ses, cacheFile) {
    this.ses = ses;
    this.cacheFile = cacheFile;
    this.blocker = null;
    this.on = false;
    this.blocked = 0;
    this.error = null;
    this.loading = null;
  }

  async load() {
    if (this.blocker) return this.blocker;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          if (Date.now() - fs.statSync(this.cacheFile).mtimeMs > MAX_AGE) fs.rmSync(this.cacheFile);
        } catch {
          // pas encore de cache
        }
        const caching = {
          path: this.cacheFile,
          read: (p) => fs.promises.readFile(p),
          write: (p, buf) => fs.promises.writeFile(p, buf),
        };
        const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking((url) => net.fetch(url), caching);
        blocker.on('request-blocked', () => this.blocked++);
        this.blocker = blocker;
        return blocker;
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  async enable() {
    this.on = true;
    try {
      const blocker = await this.load();
      this.error = null;
      if (this.on && !blocker.isBlockingEnabled(this.ses)) blocker.enableBlockingInSession(this.ses);
    } catch (err) {
      this.error = err.message;
      throw err;
    }
  }

  disable() {
    this.on = false;
    if (this.blocker && this.blocker.isBlockingEnabled(this.ses)) this.blocker.disableBlockingInSession(this.ses);
  }
}

module.exports = { AdBlock };
