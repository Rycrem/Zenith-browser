'use strict';

const { safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk').default;

// Les IA proposées par « ia ». Claude passe par le SDK d'Anthropic (avec recherche web) ;
// les autres par leur API compatible OpenAI (chat/completions en streaming).
const PROVIDERS = {
  claude: {
    name: 'Claude (Anthropic)',
    model: 'claude-opus-5-5',
    env: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    free: false,
    web: true,
  },
  gemini: {
    name: 'Gemini (Google)',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
    env: 'GEMINI_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
    free: true,
  },
  chatgpt: {
    name: 'ChatGPT (OpenAI)',
    base: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    env: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    free: false,
  },
  mistral: {
    name: 'Mistral AI',
    base: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    env: 'MISTRAL_API_KEY',
    keyUrl: 'https://console.mistral.ai/api-keys',
    free: true,
  },
  groq: {
    name: 'Groq (Llama, GPT-OSS, Qwen…)',
    base: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    env: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys',
    free: true,
  },
  openrouter: {
    name: 'OpenRouter (modèles gratuits)',
    base: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    env: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/keys',
    free: true,
    headers: { 'HTTP-Referer': 'https://github.com/Rycrem/dev-brows', 'X-Title': 'dev-brows' },
  },
  ollama: {
    name: 'Ollama (sur ton ordinateur)',
    base: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyUrl: 'https://ollama.com/download',
    free: true,
    noKey: true,
  },
};

const ALIASES = { anthropic: 'claude', google: 'gemini', openai: 'chatgpt', gpt: 'chatgpt', local: 'ollama' };
const DEFAULT_PROVIDER = 'claude';

const BASE_SYSTEM = [
  'Tu réponds dans la barre de commande d\'un navigateur web en mode terminal.',
  'Réponds en français, en 2 à 5 phrases courtes, sans titre ni liste sauf si la question en demande une.',
  'Va droit au but : la personne veut une description rapide, pas un exposé.',
  'Le texte brut s\'affiche tel quel : pas de Markdown.',
];
const SYSTEM_WEB = [...BASE_SYSTEM, 'Quand la question porte sur l\'actualité, un prix, une date ou un fait qui peut avoir changé, fais une recherche web avant de répondre.'].join(' ');
const SYSTEM_OFFLINE = [...BASE_SYSTEM, 'Tu n\'as pas accès au web : si la réponse dépend de l\'actualité, dis-le en une phrase.'].join(' ');

function resolve(name) {
  const id = String(name || '').toLowerCase();
  const key = ALIASES[id] || id;
  return PROVIDERS[key] ? key : null;
}

// Ancien format : une seule clé (aiKey) et un seul modèle (aiModel), pour Claude.
function migrate(settings) {
  const d = settings.data;
  if (!d.aiKey && !d.aiModel) return;
  d.aiKeys = { claude: d.aiKey, ...d.aiKeys };
  if (d.aiModel) d.aiModels = { claude: d.aiModel, ...d.aiModels };
  delete d.aiKey;
  delete d.aiModel;
  settings.save();
}

function current(settings) {
  return resolve(settings.data.aiProvider) || DEFAULT_PROVIDER;
}

function use(settings, id) {
  settings.data.aiProvider = id;
  settings.save();
}

function model(settings, id = current(settings)) {
  return (settings.data.aiModels && settings.data.aiModels[id]) || PROVIDERS[id].model;
}

function setModel(settings, id, value) {
  settings.data.aiModels = { ...settings.data.aiModels, [id]: value };
  settings.save();
}

// Les clés sont chiffrées par le système (trousseau macOS, DPAPI Windows, libsecret Linux) quand c'est possible.
function saveKey(settings, id, key) {
  const entry = safeStorage.isEncryptionAvailable() ? { enc: safeStorage.encryptString(key).toString('base64') } : { plain: key };
  settings.data.aiKeys = { ...settings.data.aiKeys, [id]: entry };
  settings.save();
  return !entry.plain;
}

function removeKey(settings, id) {
  if (!settings.data.aiKeys || !settings.data.aiKeys[id]) return false;
  delete settings.data.aiKeys[id];
  settings.save();
  return true;
}

function storedKey(settings, id) {
  const k = settings.data.aiKeys && settings.data.aiKeys[id];
  if (k && k.enc) return safeStorage.decryptString(Buffer.from(k.enc, 'base64'));
  if (k && k.plain) return k.plain;
  return null;
}

function readKey(settings, id) {
  return storedKey(settings, id) || (PROVIDERS[id].env && process.env[PROVIDERS[id].env]) || null;
}

// État de chaque IA pour l'écran de choix.
function list(settings) {
  const cur = current(settings);
  return Object.entries(PROVIDERS).map(([id, p]) => {
    let key = 'à connecter';
    if (p.noKey) key = 'sans clé';
    else if (settings.data.aiKeys && settings.data.aiKeys[id]) key = 'clé enregistrée';
    else if (p.env && process.env[p.env]) key = `clé via ${p.env}`;
    return { id, name: p.name, model: model(settings, id), free: p.free, web: !!p.web, key, ready: key !== 'à connecter', current: id === cur, keyUrl: p.keyUrl };
  });
}

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorMessage(err, id) {
  const p = PROVIDERS[id] || PROVIDERS.claude;
  if (err instanceof Anthropic.AuthenticationError) return 'clé API refusée : vérifie-la avec « ia key <clé> »';
  if (err instanceof Anthropic.PermissionDeniedError) return 'cette clé n\'a pas accès à ce modèle';
  if (err instanceof Anthropic.RateLimitError) return 'trop de requêtes ou crédit épuisé, réessaie plus tard';
  if (err instanceof Anthropic.APIConnectionError) return 'impossible de joindre l\'API Claude (connexion ?)';
  if (err instanceof Anthropic.APIError) return `erreur de l'API (${err.status}) : ${err.message}`;
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api.?key/i.test(err.message))) return `clé refusée par ${p.name} : vérifie-la avec « ia key <clé> » (${err.message})`;
    if (err.status === 429) return `limite atteinte chez ${p.name} (quota gratuit ou trop de requêtes), réessaie plus tard`;
    if (err.status === 404) return `modèle « ${err.model} » introuvable chez ${p.name} : change-le avec « ia model <id> » (${err.message})`;
    return `erreur de ${p.name} (${err.status}) : ${err.message}`;
  }
  if (err && err.name === 'TypeError' && /fetch/i.test(err.message)) {
    if (id === 'ollama') return `Ollama ne répond pas : installe-le (ollama.com), puis « ollama pull ${PROVIDERS.ollama.model} »`;
    return `impossible de joindre ${p.name} (connexion ?)`;
  }
  return err.message;
}

// Claude : streaming avec recherche web. onText reçoit le texte au fur et à mesure.
async function askClaude(apiKey, modelId, question, onText) {
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
      model: modelId,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: SYSTEM_WEB,
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

// Les autres : API compatible OpenAI, réponse en flux SSE (« data: {...} » par ligne).
async function askCompatible(p, apiKey, modelId, question, onText) {
  const headers = { 'content-type': 'application/json', ...p.headers };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_OFFLINE }, { role: 'user', content: question }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 200);
    try {
      const j = JSON.parse(body);
      const e = Array.isArray(j) ? j[0] && j[0].error : j.error;
      message = (e && (e.message || e)) || j.message || message;
    } catch {
      // réponse qui n'est pas du JSON
    }
    const err = new ProviderError(res.status, String(message));
    err.model = modelId;
    throw err;
  }
  let text = '';
  let buffer = '';
  let refused = false;
  const decoder = new TextDecoder();
  const handle = (line) => {
    if (!line.startsWith('data:')) return; // commentaires « : … » envoyés pour garder la connexion
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new ProviderError(chunk.error.code || 500, chunk.error.message || 'erreur pendant la réponse');
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) return;
    if (choice.finish_reason === 'content_filter') refused = true;
    const piece = choice.delta && choice.delta.content;
    if (piece) {
      text += piece;
      onText(text, []);
    }
  };
  for await (const bytes of res.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) handle(line.trim());
  }
  handle(buffer.trim());
  return { text: text.trim(), sources: [], refused };
}

// Pose la question à l'IA choisie. Renvoie { text, sources, refused }.
async function ask(settings, question, onText) {
  const id = current(settings);
  const p = PROVIDERS[id];
  const apiKey = readKey(settings, id);
  if (!apiKey && !p.noKey) throw new Error(`pas de clé pour ${p.name} : crée-en une sur ${p.keyUrl.replace('https://', '')} puis tape « ia key <clé> »`);
  if (id === 'claude') return askClaude(apiKey, model(settings, id), question, onText);
  return askCompatible(p, apiKey, model(settings, id), question, onText);
}

module.exports = {
  PROVIDERS,
  resolve,
  migrate,
  current,
  use,
  model,
  setModel,
  saveKey,
  removeKey,
  readKey,
  list,
  ask,
  errorMessage,
};
