'use strict';

const C = require('../../shared/commands');
const { t, mark } = require('../../shared/i18n');
const state = require('../state');
const output = require('../terminal/output');
const questions = require('../terminal/questions');

// Sans réglage, Electron accorde tout (caméra, micro, position…) sans demander.
// Ici, chaque demande passe par une question dans le terminal.
const SAFE_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write', 'mediaKeySystem']);

const PERMISSION_LABELS = {
  camera: mark('la caméra'),
  microphone: mark('le micro'),
  geolocation: mark('ta position'),
  notifications: mark('les notifications'),
  'clipboard-read': mark('la lecture du presse-papier'),
  'display-capture': mark('le partage d\'écran'),
  midi: mark('les appareils MIDI'),
  midiSysex: mark('les appareils MIDI'),
  openExternal: mark('l\'ouverture d\'une application externe'),
  'idle-detection': mark('la détection d\'inactivité'),
  'storage-access': mark('ses cookies sur d\'autres sites'),
  'top-level-storage-access': mark('ses cookies sur d\'autres sites'),
  'window-management': mark('la gestion des fenêtres et écrans'),
  'speaker-selection': mark('le choix de la sortie audio'),
};

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url || t('ce site');
  }
}

// Une demande « media » couvre la caméra et/ou le micro.
function permissionKeys(permission, details) {
  if (permission !== 'media') return [permission];
  const types = details.mediaTypes && details.mediaTypes.length ? details.mediaTypes : ['audio', 'video'];
  return types.map((t) => (t === 'video' ? 'camera' : 'microphone'));
}

function setupPermissions(s = state.ses) {
  if (!state.settings.data.permissions) state.settings.data.permissions = {};
  const saved = state.settings.data.permissions;
  s.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (SAFE_PERMISSIONS.has(permission)) return callback(true);
    if (state.win && wc === state.win.webContents) return callback(false); // l'interface n'a besoin de rien
    const origin = originOf(details.requestingUrl || (wc && wc.getURL()));
    const keys = permissionKeys(permission, details);
    const known = keys.map((k) => saved[origin] && saved[origin][k]);
    if (known.every((v) => v !== undefined)) return callback(known.every(Boolean));
    const label = [...new Set(keys.map((k) => (PERMISSION_LABELS[k] ? t(PERMISSION_LABELS[k]) : k)))].join(t(' et '));
    const extra = permission === 'openExternal' && details.externalURL ? ` (${details.externalURL.slice(0, 60)})` : '';
    const lines = questions.enqueue(t('{site} demande {what}{extra} : O = oui, t = toujours, j = jamais, n = non (O/n)', { site: origin, what: label, extra }), async (input, say) => {
      const a = input.toLowerCase();
      const ok = /^(|o|oui|y|yes|t|toujours|a|always)$/.test(a);
      if (/^(t|toujours|j|jamais|a|always|x|never)$/.test(a)) {
        saved[origin] = saved[origin] || {};
        for (const k of keys) saved[origin][k] = ok;
        state.settings.save();
      }
      callback(ok);
      say(ok ? t('  ✓ {what} : autorisé pour {site}', { what: label, site: origin }) : t('  ✗ {what} : refusé à {site}', { what: label, site: origin }), ok ? 'ok' : 'dim');
    });
    if (lines.length) {
      output.print(lines);
      output.focusTerminal();
    }
    return undefined;
  });
  s.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (SAFE_PERMISSIONS.has(permission)) return true;
    if (wc && state.win && wc === state.win.webContents) return false;
    const origin = originOf(requestingOrigin);
    const key = permission === 'media' ? (details.mediaType === 'video' ? 'camera' : 'microphone') : permission;
    return !!(saved[origin] && saved[origin][key] === true);
  });
}

function permCommand(args, say) {
  const saved = state.settings.data.permissions;
  if (args[0] === 'reset') {
    const origin = args[1] ? originOf(C.normalizeUrl(args[1])) : null;
    if (origin) delete saved[origin];
    else for (const k of Object.keys(saved)) delete saved[k];
    state.settings.save();
    say(origin ? t('  ✓ autorisations de {site} effacées', { site: origin }) : t('  ✓ autorisations effacées'), 'ok');
    return;
  }
  const entries = Object.entries(saved);
  if (!entries.length) say(t('  aucune autorisation enregistrée'), 'dim');
  for (const [origin, perms] of entries) {
    const list = Object.entries(perms).map(([k, v]) => `${v ? '✓' : '✗'} ${PERMISSION_LABELS[k] ? t(PERMISSION_LABELS[k]) : k}`).join(', ');
    say(`  ${origin} : ${list}`);
  }
  say(t('  perm reset [site] pour effacer'), 'dim');
}

Object.assign(module.exports, { setupPermissions, permCommand });
