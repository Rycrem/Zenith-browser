'use strict';

// Processus à part (utilityProcess) où vit le modèle de Nadir. Zenith ne le lance qu'au premier
// message et l'arrête quand on ne s'en sert plus : toute la mémoire du modèle est alors rendue.
// Les outils (commandes, page ouverte) restent dans le processus principal : on les y appelle.

const { registerHooks } = require('node:module');

// node-llama-cpp essaie chaque binaire (carte graphique) dans un processus enfant avant de le charger,
// pour ne pas planter le processus qui s'en sert. Avec les fuses de Zenith, ce processus-ci ne peut pas
// en lancer d'autre ; il est de toute façon déjà à part : s'il plante, Zenith le relance sur le processeur.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/bindings/utils/testBindingBinary.js')) return { format: 'module', source: 'export async function testBindingBinary() { return true; }', shortCircuit: true };
    return nextLoad(url, context);
  },
});

let lib = null; // node-llama-cpp, un module ESM chargé à la demande
let llama = null;
let loaded = null; // { path, model, context, session }
let abort = null;
let download = null;
let nextCall = 1;
const calls = new Map(); // appels d'outils en attente : id → { resolve, reject }

const send = (m) => process.parentPort.postMessage(m);
function fail(id, err) {
  const message = String((err && err.message) || err);
  // Discussion trop longue pour la mémoire du modèle : la suivante repartira de zéro.
  const tooLong = /context (shift|size)/i.test(message);
  if (tooLong && loaded && loaded.session) {
    loaded.session.dispose();
    loaded.session = null;
  }
  send({ type: 'error', id, message, tooLong, memory: !!(lib && err instanceof lib.InsufficientMemoryError) });
}

async function load(level) {
  if (loaded && loaded.path === level.path) return loaded;
  if (loaded) await loaded.model.dispose();
  loaded = null;
  send({ type: 'status', status: 'loading' });
  if (!lib) lib = await import('node-llama-cpp');
  // Jamais de compilation sur l'ordinateur de la personne : les binaires livrés, sinon le processeur seul.
  if (!llama) llama = await lib.getLlama({ build: 'never', gpu: level.cpu ? false : 'auto', logLevel: lib.LlamaLogLevel.error });
  const model = await llama.loadModel({ modelPath: level.path });
  const context = await model.createContext({ contextSize: { max: 8192 } });
  loaded = { path: level.path, thoughts: level.thoughts, model, context, session: null };
  send({ type: 'status', status: 'ready', gpu: llama.gpu || null });
  return loaded;
}

// Une discussion reprise après un arrêt du processus : on lui redonne ses échanges.
function session(m, system, history) {
  if (m.session) return m.session;
  const chatWrapper = m.thoughts === 'discourage' ? new lib.QwenChatWrapper({ thoughts: 'discourage' }) : 'auto';
  m.session = new lib.LlamaChatSession({ contextSequence: m.context.getSequence(), systemPrompt: system, chatWrapper, autoDisposeSequence: true });
  if (history.length) {
    m.session.setChatHistory([
      { type: 'system', text: system },
      ...history.map((h) => (h.role === 'user' ? { type: 'user', text: h.text } : { type: 'model', response: [h.text] })),
    ]);
  }
  return m.session;
}

function callTool(name, params) {
  const id = nextCall++;
  return new Promise((resolve, reject) => {
    calls.set(id, { resolve, reject });
    send({ type: 'tool', callId: id, name, params });
  });
}

async function prompt(msg) {
  const m = await load(msg.level);
  const s = session(m, msg.system, msg.history);
  const functions = {};
  for (const tool of msg.tools) {
    functions[tool.name] = { description: tool.description, params: tool.params, handler: (p) => callTool(tool.name, p || {}) };
  }
  abort = new AbortController();
  send({ type: 'status', status: 'thinking' });
  await s.prompt(msg.text, {
    functions,
    maxParallelFunctionCalls: 1,
    onTextChunk: (text) => send({ type: 'chunk', id: msg.id, text }),
    signal: abort.signal,
    stopOnAbortSignal: true,
    maxTokens: 1500,
    budgets: { thoughtTokens: 400 },
  });
  abort = null;
  send({ type: 'done', id: msg.id });
}

async function fetchModel(msg) {
  if (!lib) lib = await import('node-llama-cpp');
  download = new AbortController();
  let last = 0;
  const downloader = await lib.createModelDownloader({
    modelUri: msg.uri,
    dirPath: msg.dir,
    fileName: msg.file,
    onProgress: ({ totalSize, downloadedSize }) => {
      if (Date.now() - last < 250) return;
      last = Date.now();
      send({ type: 'status', status: 'download', done: downloadedSize, total: totalSize });
    },
  });
  await downloader.download({ signal: download.signal });
  download = null;
  send({ type: 'downloaded', id: msg.id });
}

process.parentPort.on('message', (e) => {
  const msg = e.data;
  if (msg.type === 'prompt') prompt(msg).catch((err) => fail(msg.id, err));
  else if (msg.type === 'download') fetchModel(msg).catch((err) => fail(msg.id, err));
  else if (msg.type === 'tool-result') {
    const c = calls.get(msg.callId);
    calls.delete(msg.callId);
    if (c) c.resolve(msg.result);
  } else if (msg.type === 'abort') {
    if (abort) abort.abort();
    if (download) download.abort();
    for (const c of calls.values()) c.resolve('Arrêté par la personne.');
    calls.clear();
  } else if (msg.type === 'reset' && loaded && loaded.session) {
    loaded.session.dispose();
    loaded.session = null;
  }
});
