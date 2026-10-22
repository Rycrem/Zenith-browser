'use strict';

const ai = require('./providers');
const { t } = require('../../shared/i18n');
const { shortUrl } = require('../../shared/search');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const screens = require('../terminal/screens');
const output = require('../terminal/output');

let aiRequest = 0;

function aiProvidersScreen(tab) {
  const rows = ai.list(state.settings).map((r, i) => ({ n: i + 1, ...r }));
  screens.setScreen(tab, { kind: 'aiproviders', rows }, rows.map((r) => ({ kind: 'aiuse', provider: r.id })));
}

// Choisit une IA ; sans clé, ouvre la page où la créer.
function aiUse(tab, id, say) {
  const p = ai.PROVIDERS[id];
  ai.use(state.settings, id);
  say(t('  ✓ ia : {name} · modèle {model}', { name: t(p.name), model: ai.model(state.settings, id) }), 'ok');
  if (!p.noKey && !ai.readKey(state.settings, id)) {
    say(p.free ? t('  il faut une clé (gratuite) : crée-la sur la page ouverte, puis tape « ia key <clé> »') : t('  il faut une clé : crée-la sur la page ouverte, puis tape « ia key <clé> »'), 'warn');
    tabList.createTab({ url: p.keyUrl });
  } else if (id === 'ollama') {
    say(t('  Ollama doit tourner sur cet ordinateur avec le modèle installé (« ollama pull {model} »)', { model: ai.model(state.settings, id) }), 'dim');
  }
  if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
}

function aiCommand(tab, args, rest, say) {
  const sub = (args[0] || '').toLowerCase();
  const target = ai.resolve(args[1]);
  if (!rest) {
    aiProvidersScreen(tab);
    return;
  }
  if (sub === 'key' || (sub === 'connect' && target)) {
    const id = sub === 'key' ? ai.current(state.settings) : target;
    const key = sub === 'key' ? args[1] : args[2];
    if (sub === 'connect') ai.use(state.settings, id);
    if (!key) {
      if (sub === 'connect') aiUse(tab, id, say);
      else say(t('  ia key <clé de {name}>', { name: ai.PROVIDERS[id].name }), 'err');
      return;
    }
    const encrypted = ai.saveKey(state.settings, id, key);
    say(t('  ✓ clé {name} enregistrée', { name: ai.PROVIDERS[id].name }) + (encrypted ? t(' (chiffrée par le système)') : t(' (le système ne permet pas de la chiffrer)')), 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'use' && args.length === 2) {
    if (!target) throw new Error(t('IA inconnue : {name} ({list})', { name: args[1], list: Object.keys(ai.PROVIDERS).join(', ') }));
    aiUse(tab, target, say);
    return;
  }
  if (sub === 'logout' && args.length <= 2) {
    const id = args[1] ? target : ai.current(state.settings);
    if (!id) throw new Error(t('IA inconnue : {name}', { name: args[1] }));
    say(ai.removeKey(state.settings, id) ? t('  ✓ clé {name} supprimée', { name: ai.PROVIDERS[id].name }) : t('  pas de clé enregistrée pour {name}', { name: ai.PROVIDERS[id].name }), 'ok');
    if (tab.screen && tab.screen.kind === 'aiproviders') aiProvidersScreen(tab);
    return;
  }
  if (sub === 'model' && args.length <= 2) {
    const id = ai.current(state.settings);
    if (args[1]) ai.setModel(state.settings, id, args[1] === 'default' ? null : args[1]);
    say(t('  modèle {name} : {model}', { name: ai.PROVIDERS[id].name, model: ai.model(state.settings, id) }));
    return;
  }
  aiAsk(tab, rest, null, say);
}

// Pose une question ; prev : l'écran de la discussion en cours, dont les échanges servent de contexte.
function aiAsk(tab, question, prev, say) {
  const id = ++aiRequest;
  const provider = ai.current(state.settings);
  const turns = prev ? [...prev.turns, { q: prev.question, a: prev.text }] : [];
  const screen = { kind: 'ai', id, provider: ai.PROVIDERS[provider].name, question, turns, text: '', sources: [], done: false, error: null };
  screens.setScreen(tab, screen, []);
  let timer = null;
  // Le texte arrive en continu : on rafraîchit l'écran au plus toutes les 80 ms.
  const refresh = (final) => {
    if (tab.screen !== screen) return; // la personne est passée à autre chose
    clearTimeout(timer);
    if (final) screens.setScreen(tab, screen, screen.sources.map((src) => ({ kind: 'url', url: src.url })));
    else timer = setTimeout(() => ui.sendState(), 80);
  };
  const history = turns.filter((x) => x.a).flatMap((x) => [{ role: 'user', content: x.q }, { role: 'assistant', content: x.a }]);
  ai.ask(state.settings, question, (text) => {
    screen.text = text;
    refresh(false);
  }, history).then((r) => {
    screen.text = r.text || (r.refused ? '' : t('(pas de réponse)'));
    screen.sources = r.sources.map((src, i) => ({ n: i + 1, ...src, short: shortUrl(src.url) }));
    if (r.refused) screen.error = t('{name} a refusé de répondre à cette question.', { name: screen.provider });
    if (r.switched) say(t('  le modèle {from} a été retiré : {name} utilise maintenant {to}', { from: r.switched.from, name: screen.provider, to: r.switched.to }));
    screen.done = true;
    refresh(true);
  }).catch((err) => {
    screen.error = ai.errorMessage(err, provider);
    screen.done = true;
    refresh(true);
    if (id === aiRequest) output.print([{ t: `  ${screen.error}`, c: 'err' }]);
  });
}

Object.assign(module.exports, { aiUse, aiCommand, aiAsk });
