'use strict';

const { app, utilityProcess } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../../shared/nadir');
const C = require('../../shared/commands');
const { t, getLang } = require('../../shared/i18n');
const journal = require('../storage/log');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const output = require('../terminal/output');
const commands = require('../terminal/commands');
const menu = require('../window/menu');
const panels = require('../panels/panels');
const panelData = require('../panels/panel-data');
const page = require('./page-tools');

// Sans message depuis 5 minutes, le modèle est libéré (le processus s'arrête) : Nadir ne tourne
// que quand on s'en sert, et repart tout seul au message suivant.
const IDLE_MS = 5 * 60 * 1000;

let worker = null;
let loaded = false; // le modèle est en mémoire
let idleTimer = null;
let nextId = 1;
let refreshTimer = null;
// La discussion, commune à toutes les fenêtres ; win : la fenêtre où Nadir agit.
// sawPrivate : Nadir a vu un onglet privé, la discussion s'efface à la fin de la navigation privée.
// acting : Nadir clique ou écrit dans la page, qui prend le focus sans fermer la popup.
const chat = { messages: [], busy: false, status: null, pending: null, live: null, queued: null, asked: null, win: null, sawPrivate: false, acting: false };

const dir = () => path.join(app.getPath('userData'), 'nadir');
const levelId = () => N.resolveLevel(state.settings.data.nadirLevel) || N.defaultLevel(os.totalmem());
const modelPath = (id) => path.join(dir(), N.LEVELS[id].file);
const downloaded = (id) => fs.existsSync(modelPath(id));
const levelName = (id) => t(N.LEVELS[id].name);

// La popup suit la discussion ; le texte qui arrive en continu la rafraîchit au plus toutes les 80 ms.
function refresh(now = true) {
  const go = () => {
    refreshTimer = null;
    // Le texte en continu ne change que la popup ; l'étoile de la barre du bas suit busy et running.
    for (const w of state.allWindows()) state.inWindow(w, () => panels.sendPanel('nadir'));
  };
  if (now) {
    clearTimeout(refreshTimer);
    go();
    ui.sendStateAll();
  } else if (!refreshTimer) refreshTimer = setTimeout(go, 80);
}

function add(role, text) {
  const m = { role, text };
  chat.messages.push(m);
  if (chat.messages.length > 200) chat.messages.splice(0, chat.messages.length - 200);
  refresh();
  return m;
}

function openPanel() {
  if (state.panel && state.panel.kind === 'nadir' && !state.panel.win.isDestroyed()) return;
  state.win.webContents.send('ui:panel', 'nadir');
}

// ------------------------------------------------ le processus du modèle

function startWorker() {
  if (worker) return worker;
  worker = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], { serviceName: 'Nadir', stdio: 'pipe' });
  const w = worker;
  w.stderr.on('data', (d) => journal.log(`nadir : ${String(d).trim()}`));
  w.on('message', onMessage);
  w.on('exit', (code) => {
    if (worker !== w) return;
    worker = null;
    loaded = false;
    // Plantage au chargement du modèle : la carte graphique n'y arrive pas, on repasse sur le processeur.
    if (chat.status && chat.status.kind === 'loading' && !state.settings.data.nadirCpu && chat.asked) {
      journal.log(`nadir : arrêt au chargement du modèle (code ${code}), nouvel essai sans carte graphique`);
      state.settings.data.nadirCpu = true;
      state.settings.save();
      chat.status = null;
      add('info', t('La carte graphique n\'a pas réussi à charger le modèle : Nadir passe sur le processeur, un peu plus lent.'));
      return ask(chat.asked, true);
    }
    if (chat.busy || chat.status) {
      chat.busy = false;
      chat.status = null;
      chat.live = null;
      add('error', t('Nadir s\'est arrêté en cours de route (code {code}) : la mémoire de l\'ordinateur ne suffit peut-être pas, essaie le niveau léger.', { code }));
    }
    refresh();
  });
  return w;
}

function stopWorker() {
  clearTimeout(idleTimer);
  if (!worker) return false;
  const w = worker;
  worker = null;
  loaded = false;
  w.kill();
  // Le processus ne dira plus « done » : la réponse en cours s'arrête ici.
  if (chat.pending) chat.pending.resolve(false);
  if (chat.live && !chat.live.text.trim()) chat.messages.splice(chat.messages.indexOf(chat.live), 1);
  Object.assign(chat, { busy: false, status: null, live: null, queued: null, pending: null, acting: false });
  refresh();
  return true;
}

function idleLater() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (chat.busy || chat.status) return idleLater();
    journal.log('nadir : modèle libéré après 5 minutes sans message');
    stopWorker();
  }, IDLE_MS);
}

function onMessage(m) {
  if (m.type === 'status') {
    if (m.status === 'ready') {
      loaded = true;
      if (m.gpu === false) journal.log('nadir : pas de carte graphique utilisable, le modèle tourne sur le processeur');
    }
    chat.status = m.status === 'ready' ? null : m.status === 'download' ? { kind: 'download', done: m.done, total: m.total } : { kind: m.status };
    refresh(m.status !== 'download');
  } else if (m.type === 'chunk') {
    if (!chat.live) chat.live = add('nadir', '');
    chat.live.text += m.text;
    refresh(false);
  } else if (m.type === 'tool') {
    chat.live = null;
    const gone = !chat.win || !chat.win.win || chat.win.win.isDestroyed();
    (gone ? Promise.resolve('La fenêtre a été fermée : arrête-toi là.') : state.inWindow(chat.win, () => runTool(m.name, m.params)))
      .catch((err) => `Erreur : ${err.message}`)
      .then((result) => worker && worker.postMessage({ type: 'tool-result', callId: m.callId, result: String(result).slice(0, 6000) }));
  } else if (m.type === 'done') {
    finish();
  } else if (m.type === 'downloaded') {
    chat.status = null;
    add('info', t('Modèle téléchargé, il reste sur ton ordinateur.'));
    const q = chat.queued;
    chat.queued = null;
    chat.busy = false;
    if (q) ask(q, true);
  } else if (m.type === 'error') {
    let text = t('Nadir n\'a pas pu répondre : {error}', { error: m.message });
    if (m.memory) text = t('Pas assez de mémoire pour le niveau {level} : choisis un niveau plus léger.', { level: levelName(levelId()) });
    else if (m.tooLong) text = t('La discussion est devenue trop longue pour ma mémoire : je repars de zéro, redemande-moi.');
    journal.log(`nadir : ${m.message}`);
    add('error', text);
    finish();
  }
}

function finish() {
  if (chat.live && !chat.live.text.trim()) chat.messages.splice(chat.messages.indexOf(chat.live), 1);
  chat.live = null;
  chat.busy = false;
  chat.status = null;
  chat.queued = null;
  if (chat.pending) chat.pending.resolve(false);
  chat.pending = null;
  idleLater();
  refresh();
}

// ------------------------------------------------ la discussion

const TOOLS = [
  {
    name: 'commande',
    description: 'Lance une commande de Zenith, comme si la personne la tapait dans le terminal. Renvoie ce que Zenith affiche.',
    params: { type: 'object', properties: { ligne: { type: 'string', description: 'la commande, par exemple « go wikipedia.org » ou « tab 2 »' } } },
  },
  { name: 'onglets', description: 'Liste les onglets ouverts (numéro, titre, adresse).' },
  {
    name: 'lire_page',
    description: 'Lit le titre, l\'adresse et le texte de la page ouverte dans l\'onglet actif.',
    params: { type: 'object', properties: { partie: { type: 'integer', description: '1 pour le début, 2 pour la suite…' } } },
  },
  {
    name: 'elements_page',
    description: 'Liste les liens, boutons et champs de la page, numérotés, pour cliquer ou écrire dedans.',
    params: { type: 'object', properties: { filtre: { type: 'string', description: 'mot que doit contenir l\'élément, ou "" pour tout' } } },
  },
  {
    name: 'cliquer',
    description: 'Clique sur un élément numéroté par elements_page.',
    params: { type: 'object', properties: { numero: { type: 'integer' } } },
  },
  {
    name: 'ecrire',
    description: 'Écrit un texte dans un champ numéroté par elements_page, et appuie sur Entrée si demandé.',
    params: { type: 'object', properties: { numero: { type: 'integer' }, texte: { type: 'string' }, entree: { type: 'boolean' } } },
  },
];

function confirmAction(question) {
  if (chat.pending) chat.pending.resolve(false);
  return new Promise((resolve) => {
    chat.pending = {
      kind: 'confirm',
      question,
      resolve: (yes) => {
        chat.pending = null;
        resolve(yes);
        refresh();
      },
    };
    openPanel();
    refresh();
  });
}

// La page change après une commande : on attend un peu qu'elle se charge avant de dire où on est.
async function settled() {
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 20; i++) {
    const tab = tabList.activeTab();
    if (!tab || !tab.loading) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function acting(fn) {
  chat.acting = true;
  try {
    return await fn();
  } finally {
    chat.acting = false;
  }
}

async function runTool(name, p) {
  const tab = tabList.activeTab();
  if (state.privateMode || (tab && tab.private)) chat.sawPrivate = true;
  if (name === 'commande') {
    const line = String(p.ligne || '').trim();
    if (!line) return 'Commande vide.';
    if (/^nadir\b/i.test(line)) return 'Tu es déjà Nadir : pas besoin de cette commande.';
    if (state.prompts.length) return `Une question attend une réponse dans le terminal (${state.prompts[0].question}) : la personne doit y répondre d'abord.`;
    add('action', `❯ ${line}`);
    // Un numéro sur l'écran des téléchargements ouvre le fichier.
    const opensFile = /^\d+/.test(line) && tab && tab.screen && tab.screen.kind === 'dl';
    if ((opensFile || N.needsConfirm(line, state.settings.data.aliases)) && !(await confirmAction(t('Lancer « {line} » ?', { line })))) return 'La personne a refusé : ne le refais pas.';
    const r = await commands.exec(line);
    output.print([{ t: `❯ ${line}`, c: 'cmd' }, { t: t('  lancé par Nadir'), c: 'dim' }, ...r.lines]);
    await settled();
    const said = r.lines.map((l) => l.t.trim()).filter(Boolean).join('\n');
    const asked = state.prompts.length ? `Zenith pose une question dans le terminal : ${state.prompts[0].question} La personne doit y répondre.` : '';
    return [said || 'Fait.', asked, page.whereAmI(tabList.activeTab())].filter(Boolean).join('\n');
  }
  if (name === 'onglets') return page.listTabs();
  if (name === 'lire_page') {
    add('action', t('lit la page'));
    return page.readPage(tab, Number(p.partie) || 1);
  }
  if (name === 'elements_page') return page.listElements(tab, p.filtre);
  if (name === 'cliquer') {
    const n = Math.floor(Number(p.numero));
    const el = page.element(tab, n);
    add('action', t('clic : {label}', { label: el.label || el.type }));
    if (N.riskyClick(el.label) && !(await confirmAction(t('Cliquer sur « {label} » ?', { label: el.label })))) return 'La personne a refusé : ne le refais pas.';
    return acting(() => page.click(tab, n));
  }
  if (name === 'ecrire') {
    const n = Math.floor(Number(p.numero));
    const el = page.element(tab, n);
    const text = String(p.texte || '');
    add('action', t('écrit « {text} » dans {label}', { text: text.slice(0, 60), label: el.label || el.type }));
    // Ce qui est écrit part vers le site (et Entrée envoie le formulaire) : la personne dit oui d'abord.
    const vars = { text: text.slice(0, 60), label: el.label || el.type };
    const question = p.entree ? t('Écrire « {text} » dans « {label} » et valider ?', vars) : t('Écrire « {text} » dans « {label} » ?', vars);
    if (!(await confirmAction(question))) return 'La personne a refusé : ne le refais pas.';
    return acting(() => page.write(tab, n, text, !!p.entree));
  }
  return `Outil inconnu : ${name}`;
}

function contextLine() {
  const tab = tabList.activeTab();
  if (!tab) return '';
  if (tab.screen) return `écran « ${tabList.tabTitle(tab)} » de Zenith`;
  return `« ${tab.title || ''} » ${tab.url}`;
}

// shown : la question est déjà dans la discussion (posée avant le téléchargement du modèle).
function ask(text, shown = false) {
  chat.busy = true;
  chat.asked = text;
  if (state.privateMode || (tabList.activeTab() || {}).private) chat.sawPrivate = true;
  const id = levelId();
  // La question déjà affichée n'est pas la dernière ligne (une info peut la suivre) : on retire la dernière question.
  const lastUser = shown ? chat.messages.map((m) => m.role).lastIndexOf('user') : -1;
  const prior = chat.messages.filter((m, i) => i !== lastUser);
  const history = prior.filter((m) => (m.role === 'user' || m.role === 'nadir') && m.text).slice(-12).map((m) => ({ role: m.role, text: m.text }));
  if (!shown) add('user', text);
  startWorker().postMessage({
    type: 'prompt',
    id: nextId++,
    level: { path: modelPath(id), thoughts: N.LEVELS[id].thoughts, cpu: !!state.settings.data.nadirCpu },
    system: N.systemPrompt({
      lang: getLang(),
      commands: C.COMMANDS.map(([n, a, d]) => [n, t(a), t(d)]),
      shortcuts: menu.SHORTCUTS.map(([k, d]) => [t(k), t(d)]),
    }),
    tools: TOOLS,
    history,
    text: `${text}\n\n(Onglet actif : ${contextLine()})`,
  });
  clearTimeout(idleTimer);
}

// Premier message d'un niveau pas encore téléchargé : on demande d'abord, le modèle pèse plusieurs Go.
function send(text) {
  const q = String(text || '').trim();
  if (!q || chat.busy) return;
  chat.win = state.current();
  const id = levelId();
  if (downloaded(id)) return ask(q);
  add('user', q);
  chat.queued = q;
  chat.busy = true;
  chat.pending = {
    kind: 'download',
    question: t('Pour te répondre, je dois d\'abord télécharger mon modèle « {level} » ({size}), une seule fois. Il reste ensuite sur ton ordinateur et je fonctionne sans internet.', { level: levelName(id), size: panelData.formatSize(N.LEVELS[id].size) }),
    resolve: (yes) => {
      chat.pending = null;
      if (!yes) {
        chat.queued = null;
        chat.busy = false;
        add('info', t('Téléchargement annulé. « nadir niveau » montre les autres niveaux.'));
        return;
      }
      chat.status = { kind: 'download', done: 0, total: N.LEVELS[id].size };
      fs.mkdirSync(dir(), { recursive: true });
      startWorker().postMessage({ type: 'download', id: nextId++, uri: N.LEVELS[id].uri, dir: dir(), file: N.LEVELS[id].file });
      refresh();
    },
  };
  refresh();
}

function stopAnswer() {
  if (chat.pending) chat.pending.resolve(false);
  if (worker && (chat.busy || chat.status)) worker.postMessage({ type: 'abort' });
  if (chat.status && chat.status.kind === 'download') {
    // Le processus s'arrête avec le téléchargement ; le fichier partiel n'est jamais pris pour le modèle.
    chat.queued = null;
    stopWorker();
    chat.busy = false;
    chat.status = null;
    add('info', t('Téléchargement arrêté.'));
  }
}

function reset() {
  // Une réponse en cours se sert encore de la session : on arrête plutôt le processus.
  if (chat.busy) stopWorker();
  else if (worker) worker.postMessage({ type: 'reset' });
  chat.sawPrivate = false;
  chat.messages = [];
  chat.live = null;
  refresh();
}

function setLevel(id) {
  if (chat.busy) throw new Error(t('Nadir est occupé : attends la fin de sa réponse (ou ■ pour l\'arrêter)'));
  state.settings.data.nadirLevel = id;
  state.settings.save();
  // Le modèle de l'ancien niveau quitte la mémoire ; le nouveau se chargera au prochain message.
  stopWorker();
  add('info', t('Niveau {level} : {about}.', { level: levelName(id), about: t(N.LEVELS[id].about) }) + (downloaded(id) ? '' : ' ' + t('Il sera téléchargé à ton prochain message ({size}).', { size: panelData.formatSize(N.LEVELS[id].size) })));
}

function levels() {
  const cur = levelId();
  return Object.keys(N.LEVELS).map((id) => ({ id, name: levelName(id), size: panelData.formatSize(N.LEVELS[id].size), about: t(N.LEVELS[id].about), downloaded: downloaded(id), current: id === cur }));
}

function statusText() {
  const s = chat.status;
  if (!s) return '';
  if (s.kind === 'download') {
    const pct = s.total ? Math.floor((s.done / s.total) * 100) : 0;
    return t('téléchargement du modèle : {pct} % ({done} sur {total})', { pct, done: panelData.formatSize(s.done || 0), total: panelData.formatSize(s.total || 0) });
  }
  if (s.kind === 'loading') return t('Nadir se réveille (chargement du modèle)…');
  return t('Nadir réfléchit…');
}

function panelInfo() {
  return {
    title: 'Nadir',
    messages: chat.messages.map((m) => ({ role: m.role, text: m.text })),
    busy: chat.busy,
    status: statusText(),
    progress: chat.status && chat.status.kind === 'download' && chat.status.total ? chat.status.done / chat.status.total : null,
    pending: chat.pending ? { kind: chat.pending.kind, question: chat.pending.question } : null,
    levels: levels(),
    running: loaded,
    labels: {
      hello: t('Bonjour, je suis Nadir. Je tourne sur ton ordinateur, sans rien envoyer sur internet. Pose-moi une question sur Zenith ou sur la page ouverte, ou demande-moi de faire quelque chose dans le navigateur.'),
      placeholder: t('Écris à Nadir… (Entrée pour envoyer)'),
      level: t('Niveau'),
      reset: t('Nouvelle discussion (nadir clear)'),
      stop: t('Arrêter'),
      close: t('Fermer (Échap)'),
      yes: t('Oui'),
      no: t('Non'),
      download: t('Télécharger'),
      cancel: t('Annuler'),
      running: t('modèle en mémoire · « nadir stop » le libère'),
      hint: t('Ctrl+Maj+A'),
    },
  };
}

async function panelAction(action, arg) {
  if (action === 'send' && arg && typeof arg.text === 'string') send(arg.text.slice(0, 4000));
  else if (action === 'answer' && chat.pending) chat.pending.resolve(!!(arg && arg.yes));
  else if (action === 'stop') stopAnswer();
  else if (action === 'reset') reset();
  else if (action === 'level' && arg && N.LEVELS[arg.id]) {
    try {
      setLevel(arg.id);
    } catch (err) {
      add('error', err.message);
    }
  } else if (action === 'close' && state.panel && state.panel.kind === 'nadir') state.panel.win.close();
}

function nadirCommand(args, rest, say) {
  const sub = (args[0] || '').toLowerCase();
  if (!args.length) return openPanel();
  if ((sub === 'niveau' || sub === 'level') && args.length <= 2) {
    if (args[1]) {
      const id = N.resolveLevel(args[1]);
      if (!id) throw new Error(t('niveaux : léger, normal, fort'));
      setLevel(id);
      say(t('  ✓ Nadir : niveau {level}', { level: levelName(id) }), 'ok');
      return;
    }
    for (const l of levels()) say(`  ${l.current ? '▸' : ' '} ${l.name.padEnd(7)} ${l.size.padEnd(8)} ${l.downloaded ? t('téléchargé') : t('pas téléchargé')} · ${l.about}`, l.current ? 'acc' : '');
    say(t('  « nadir niveau <nom> » pour changer'), 'dim');
    return;
  }
  if (sub === 'stop' && args.length === 1) {
    stopAnswer();
    say(stopWorker() ? t('  ✓ Nadir : modèle libéré de la mémoire') : t('  Nadir ne tourne pas'), 'ok');
    return;
  }
  if ((sub === 'clear' || sub === 'reset') && args.length === 1) {
    reset();
    say(t('  ✓ Nadir : nouvelle discussion'), 'ok');
    return;
  }
  openPanel();
  send(rest);
}

const nadirState = () => ({ running: loaded, busy: chat.busy });

// Fin de la navigation privée : ce que Nadir y a lu ne reste ni dans la discussion ni dans le modèle.
function leavePrivate() {
  if (chat.sawPrivate) reset();
}

const keepOpen = () => chat.acting;

Object.assign(module.exports, { nadirCommand, panelInfo, panelAction, nadirState, stopWorker, leavePrivate, keepOpen });
