'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');
const output = require('../terminal/output');
const questions = require('../terminal/questions');

// Une clé (YubiKey…) qui garde plusieurs comptes pour un site : on demande lequel dans le
// terminal. Sans ce choix, Electron annule la connexion.
function setupWebAuthn(s = state.ses) {
  s.on('select-webauthn-account', (e, details, callback) => {
    const accounts = details.accounts || [];
    if (accounts.length <= 1) return callback(accounts[0] && accounts[0].credentialId);
    const label = (a) => [a.displayName, a.name].filter(Boolean).join(' · ') || a.credentialId.slice(0, 12);
    const lines = questions.enqueue(t('{site} : quel compte de la clé utiliser ? {list} (1-{max})', { site: details.relyingPartyId, list: accounts.map((a, i) => `${i + 1} = ${label(a)}`).join(', '), max: accounts.length }), async (input, say) => {
      const a = accounts[(input ? Number(input) : 1) - 1];
      callback(a ? a.credentialId : undefined);
      say(a ? t('  ✓ compte {name}', { name: label(a) }) : t('  connexion annulée'), a ? 'ok' : 'dim');
    }, /^\d*$/);
    if (lines.length) {
      output.print(lines);
      output.focusTerminal();
    }
  });
}

Object.assign(module.exports, { setupWebAuthn });
