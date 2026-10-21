'use strict';

const { safeStorage } = require('electron');
const Anthropic = require('@anthropic-ai/sdk').default;
const { t, getLang } = require('../shared/i18n');

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
  'Réponds en {language}, en 2 à 5 phrases courtes, sans titre ni liste sauf si la question en demande une.',
  'Va droit au but : la personne veut une description rapide, pas un exposé.',
  'Le texte brut s\'affiche tel quel : pas de Markdown.',
];
// La consigne reste en français ; seule la langue de la réponse suit le réglage « lang ».
const system = (extra) => [...BASE_SYSTEM, extra].join(' ').replace('{language}', getLang() === 'en' ? 'anglais' : 'français');
const systemWeb = () => system('Quand la question porte sur l\'actualité, un prix, une date ou un fait qui peut avoir changé, fais une recherche web avant de répondre.');
const systemOffline = () => system('Tu n\'as pas accès au web : si la réponse dépend de l\'actualité, dis-le en une phrase.');

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

// Modèle utilisé : celui choisi avec « ia model », sinon le remplaçant trouvé quand le modèle
// par défaut a été retiré (tant que dev-brows n'a pas changé de modèle par défaut), sinon le défaut.
function model(settings, id = current(settings)) {
  const d = settings.data;
  if (d.aiModels && d.aiModels[id]) return d.aiModels[id];
  const auto = d.aiAutoModels && d.aiAutoModels[id];
  if (auto && auto.from === PROVIDERS[id].model) return auto.model;
  return PROVIDERS[id].model;
}

// value null : revient au modèle par défaut, qui suit les retraits de modèles.
function setModel(settings, id, value) {
  const d = settings.data;
  d.aiModels = { ...d.aiModels, [id]: value };
  if (!value) {
    delete d.aiModels[id];
    if (d.aiAutoModels) delete d.aiAutoModels[id];
  }
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
    let key = null;
    if (p.noKey) key = t('sans clé');
    else if (settings.data.aiKeys && settings.data.aiKeys[id]) key = t('clé enregistrée');
    else if (p.env && process.env[p.env]) key = t('clé via {env}', { env: p.env });
    return { id, name: t(p.name), model: model(settings, id), free: p.free, web: !!p.web, key: key || t('à connecter'), ready: !!key, current: id === cur, keyUrl: p.keyUrl };
  });
}

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isNotFound = (err) => (err instanceof ProviderError || err instanceof Anthropic.NotFoundError) && err.status === 404;

// Numéros d'un identifiant de modèle, pour trier du plus récent au plus ancien (« gemini-3.8-flash » → [3, 8]).
const versionOf = (m) => (m.match(/\d+/g) || []).map(Number);
function newer(a, b) {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
  return 0;
}

async function listModels(id, p, apiKey) {
  if (id === 'claude') {
    const page = await new Anthropic({ apiKey }).models.list({ limit: 100 });
    return page.data.map((m) => m.id);
  }
  const headers = { ...p.headers };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${p.base}/models`, { headers });
  if (!res.ok) return [];
  const j = await res.json();
  return (j.data || []).map((m) => String(m.id).replace(/^models\//, ''));
}

// Remplaçant d'un modèle retiré : celui que conseille le message d'erreur s'il existe,
// sinon la version la plus récente de la même famille (« gemini-#-flash », « claude-opus-#-# »…).
async function replacement(id, p, apiKey, retired, message) {
  let models = [];
  try {
    models = await listModels(id, p, apiKey);
  } catch {
    // liste indisponible : on s'en tient au conseil du message
  }
  const advised = (String(message).match(/models\/([\w.-]+)/g) || []).map((m) => m.slice(7)).find((m) => m !== retired && (!models.length || models.includes(m)));
  if (advised) return advised;
  const family = (m) => m.replace(/\d+(\.\d+)?/g, '#');
  return models.filter((m) => m !== retired && family(m) === family(retired)).sort(newer)[0] || null;
}

function errorMessage(err, id) {
  const p = PROVIDERS[id] || PROVIDERS.claude;
  if (err instanceof Anthropic.AuthenticationError) return t('clé API refusée : vérifie-la avec « ia key <clé> »');
  if (err instanceof Anthropic.PermissionDeniedError) return t('cette clé n\'a pas accès à ce modèle');
  if (err instanceof Anthropic.RateLimitError) return t('trop de requêtes ou crédit épuisé, réessaie plus tard');
  if (err instanceof Anthropic.APIConnectionError) return t('impossible de joindre l\'API Claude (connexion ?)');
  if (err instanceof Anthropic.APIError) return t('erreur de l\'API ({status}) : {error}', { status: err.status, error: err.message });
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api.?key/i.test(err.message))) return t('clé refusée par {name} : vérifie-la avec « ia key <clé> » ({error})', { name: t(p.name), error: err.message });
    if (err.status === 429) return t('limite atteinte chez {name} (quota gratuit ou trop de requêtes), réessaie plus tard', { name: t(p.name) });
    if (err.status === 404) return t('modèle « {model} » introuvable chez {name} : change-le avec « ia model <id> » ({error})', { model: err.model, name: t(p.name), error: err.message });
    return t('erreur de {name} ({status}) : {error}', { name: t(p.name), status: err.status, error: err.message });
  }
  if (err && err.name === 'TypeError' && /fetch/i.test(err.message)) {
    if (id === 'ollama') return t('Ollama ne répond pas : installe-le (ollama.com), puis « ollama pull {model} »', { model: PROVIDERS.ollama.model });
    return t('impossible de joindre {name} (connexion ?)', { name: t(p.name) });
  }
  return err.message;
}

// Claude : streaming avec recherche web. onText reçoit le texte au fur et à mesure.
async function askClaude(apiKey, modelId, question, onText, history) {
  const client = new Anthropic({ apiKey });
  const messages = [...history, { role: 'user', content: question }];
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
      system: systemWeb(),
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
async function askCompatible(p, apiKey, modelId, question, onText, history) {
  const headers = { 'content-type': 'application/json', ...p.headers };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages: [{ role: 'system', content: systemOffline() }, ...history, { role: 'user', content: question }],
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
    if (chunk.error) throw new ProviderError(chunk.error.code || 500, chunk.error.message || t('erreur pendant la réponse'));
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

// Pose la question à l'IA choisie. Renvoie { text, sources, refused, switched }.
// history : les échanges précédents de la discussion ([{ role, content }]).
// Si le modèle a été retiré, passe tout seul au modèle actuel de l'IA et s'en souvient.
async function ask(settings, question, onText, history = []) {
  const id = current(settings);
  const p = PROVIDERS[id];
  const apiKey = readKey(settings, id);
  if (!apiKey && !p.noKey) throw new Error(t('pas de clé pour {name} : crée-en une sur {url} puis tape « ia key <clé> »', { name: t(p.name), url: p.keyUrl.replace('https://', '') }));
  const run = (m) => (id === 'claude' ? askClaude(apiKey, m, question, onText, history) : askCompatible(p, apiKey, m, question, onText, history));
  const retired = model(settings, id);
  try {
    return await run(retired);
  } catch (err) {
    if (!isNotFound(err) || id === 'ollama') throw err;
    const next = await replacement(id, p, apiKey, retired, err.message);
    if (!next) throw err;
    const r = await run(next);
    const d = settings.data;
    if (d.aiModels) delete d.aiModels[id];
    d.aiAutoModels = { ...d.aiAutoModels, [id]: { from: p.model, model: next } };
    settings.save();
    return { ...r, switched: { from: retired, to: next } };
  }
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
