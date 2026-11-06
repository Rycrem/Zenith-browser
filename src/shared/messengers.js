'use strict';

// Applis de discussion de la barre du bas : les vrais sites, chacun dans sa propre session
// (cookies à part des onglets), gardée d'un lancement à l'autre.
const MESSENGERS = {
  whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com/', hosts: ['whatsapp.com', 'whatsapp.net'], partition: 'persist:zenith-whatsapp' },
  messages: { name: 'Messages', url: 'https://messages.google.com/web/conversations', hosts: ['messages.google.com', 'accounts.google.com'], partition: 'persist:zenith-messages', google: true },
  gmail: { name: 'Gmail', url: 'https://mail.google.com/mail/u/0/', hosts: ['mail.google.com', 'accounts.google.com'], partition: 'persist:zenith-gmail', google: true },
  chat: { name: 'Google Chat', url: 'https://chat.google.com/', hosts: ['chat.google.com', 'accounts.google.com'], partition: 'persist:zenith-chat', google: true },
  discord: { name: 'Discord', url: 'https://discord.com/app', hosts: ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net', 'hcaptcha.com'], partition: 'persist:zenith-discord' },
};

const isMessenger = (id) => typeof id === 'string' && Object.hasOwn(MESSENGERS, id);

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

// Pendant la connexion Google, la page passe par www.google.com, accounts.youtube.com, google.fr…
// pour poser ses cookies : ces étapes restent dans l'appli, sinon la connexion repart de zéro.
const GOOGLE = /(^|\.)(google\.com|youtube\.com|google\.[a-z]{2,3}|google\.co\.[a-z]{2})$/;
const inGoogleLogin = (id, from, to) => GOOGLE.test(from) && from !== hostOf(MESSENGERS[id].url) && GOOGLE.test(to);

// Adresse qui reste dans l'appli ; les autres s'ouvrent dans un onglet.
// from : adresse de la page d'où part la navigation.
function isOwnUrl(id, url, from) {
  const host = hostOf(url);
  if (!host) return false;
  if (MESSENGERS[id].google && from && inGoogleLogin(id, hostOf(from), host)) return true;
  return MESSENGERS[id].hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

// Messages non lus d'après le titre de la page : « (3) WhatsApp », « (12) Discord | #général »,
// « Boîte de réception (5) - moi@gmail.com - Gmail », « Chat (2) ».
// Discord met « • » quand il y a du nouveau sans mention : -1 (un simple point sur l'icône).
function unreadFromTitle(title) {
  const s = String(title || '').trim();
  const m = /^\((\d+)\+?\)/.exec(s) || /^[^()]{1,40} \((\d+)\+?\)/.exec(s);
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
