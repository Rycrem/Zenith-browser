'use strict';

// Applis de discussion de la barre du bas : les vrais sites, chacun dans sa propre session
// (cookies à part des onglets), gardée d'un lancement à l'autre.
const MESSENGERS = {
  whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com/', hosts: ['whatsapp.com', 'whatsapp.net'], partition: 'persist:zenith-whatsapp' },
  messages: { name: 'Messages', url: 'https://messages.google.com/web/conversations', hosts: ['messages.google.com', 'accounts.google.com'], partition: 'persist:zenith-messages' },
  discord: { name: 'Discord', url: 'https://discord.com/app', hosts: ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net', 'hcaptcha.com'], partition: 'persist:zenith-discord' },
};

const isMessenger = (id) => typeof id === 'string' && Object.hasOwn(MESSENGERS, id);

// Adresse qui reste dans l'appli ; les autres s'ouvrent dans un onglet.
function isOwnUrl(id, url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return MESSENGERS[id].hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

// Messages non lus d'après le titre de la page : « (3) WhatsApp », « (12) Discord | #général ».
// Discord met « • » quand il y a du nouveau sans mention : -1 (un simple point sur l'icône).
function unreadFromTitle(title) {
  const s = String(title || '').trim();
  const m = /^\((\d+)\+?\)/.exec(s);
  if (m) return Number(m[1]);
  return /^[•●]/.test(s) ? -1 : 0;
}

// Épingle id dans la liste (ordre de la barre) à la place index, ou à la fin ; le retire s'il y était.
function pinAt(list, id, index) {
  const out = list.filter((x) => x !== id);
  const i = Number.isInteger(index) ? Math.max(0, Math.min(index, out.length)) : out.length;
  out.splice(i, 0, id);
  return out;
}

module.exports = { MESSENGERS, isMessenger, isOwnUrl, unreadFromTitle, pinAt };
