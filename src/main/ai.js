'use strict';

const { safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk').default;

const DEFAULT_MODEL = 'claude-opus-5-5';

const SYSTEM = [
  'Tu réponds dans la barre de commande d\'un navigateur web en mode terminal.',
  'Réponds en français, en 2 à 5 phrases courtes, sans titre ni liste sauf si la question en demande une.',
  'Va droit au but : la personne veut une description rapide, pas un exposé.',
  'Quand la question porte sur l\'actualité, un prix, une date ou un fait qui peut avoir changé, fais une recherche web avant de répondre.',
  'Le texte brut s\'affiche tel quel : pas de Markdown.',
].join(' ');

// La clé API est chiffrée par le système (trousseau macOS, DPAPI Windows, libsecret Linux) quand c'est possible.
function saveKey(settings, key) {
  if (safeStorage.isEncryptionAvailable()) {
    settings.data.aiKey = { enc: safeStorage.encryptString(key).toString('base64') };
  } else {
    settings.data.aiKey = { plain: key };
  }
  settings.save();
  return !settings.data.aiKey.plain;
}

function readKey(settings) {
  const k = settings.data.aiKey;
  if (k && k.enc) return safeStorage.decryptString(Buffer.from(k.enc, 'base64'));
  if (k && k.plain) return k.plain;
  return process.env.ANTHROPIC_API_KEY || null;
}

function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'clé API refusée : vérifie-la avec « ia key <clé> »';
  if (err instanceof Anthropic.PermissionDeniedError) return 'cette clé n\'a pas accès à ce modèle';
  if (err instanceof Anthropic.RateLimitError) return 'trop de requêtes ou crédit épuisé, réessaie plus tard';
  if (err instanceof Anthropic.APIConnectionError) return 'impossible de joindre l\'API Claude (connexion ?)';
  if (err instanceof Anthropic.APIError) return `erreur de l'API (${err.status}) : ${err.message}`;
  return err.message;
}

// Pose la question à Claude en streaming. onText reçoit le texte au fur et à mesure.
// Renvoie { text, sources, refused }.
async function ask(settings, question, onText) {
  const apiKey = readKey(settings);
  if (!apiKey) throw new Error('pas de clé API : crée-en une sur console.anthropic.com puis tape « ia key <clé> »');
  const client = new Anthropic({ apiKey });
  const messages = [{ role: 'user', content: question }];
  let text = '';
  const sources = [];
  const seen = new Set();
  const addSource = (url, title) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ url, title: title || url });
  };

  // Une recherche web peut mettre le tour en pause (pause_turn) : on relance alors avec la suite.
  for (let round = 0; round < 3; round++) {
    const stream = client.beta.messages.stream({
      model: settings.data.aiModel || DEFAULT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      messages,
      // Si le modèle refuse pour une raison de sécurité, l'API essaie un autre modèle.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        onText(text, sources);
      }
    }
    const message = await stream.finalMessage();
    for (const block of message.content) {
      if (block.type === 'text' && block.citations) for (const c of block.citations) addSource(c.url, c.title);
    }
    for (const block of message.content) {
      // En cas d'erreur de recherche, content est un objet et pas une liste.
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === 'web_search_result') addSource(r.url, r.title);
      }
    }
    if (message.stop_reason === 'refusal') return { text, sources, refused: true };
    if (message.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: message.content });
  }
  // Les sources citées d'abord, les autres résultats de recherche ensuite, 6 au plus.
  return { text: text.trim(), sources: sources.slice(0, 6), refused: false };
}

module.exports = { ask, saveKey, readKey, errorMessage, DEFAULT_MODEL };
