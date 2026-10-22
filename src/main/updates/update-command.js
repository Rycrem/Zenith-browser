'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { newer } = require('../extensions/extensions');
const updater = require('./updater');
const { exactNotes, releaseNotes } = require('../../shared/changelog');
const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const ui = require('../window/ui');
const tabList = require('../tabs/tabs');
const output = require('../terminal/output');
const questions = require('../terminal/questions');

// Réglage enregistré, sinon case de l'installateur Windows, sinon activé.
function autoUpdateOn() {
  if (typeof state.settings.data.autoUpdate === 'boolean') return state.settings.data.autoUpdate;
  let on = true;
  if (app.isPackaged) {
    try {
      on = fs.readFileSync(path.join(process.resourcesPath, 'default-autoupdate'), 'utf8').trim() !== 'off';
      // Gardé dans les réglages : une mise à jour silencieuse réinstalle sans cette page.
      state.settings.data.autoUpdate = on;
      state.settings.save();
    } catch {
      // pas de fichier : installé autrement qu'avec l'installateur Windows
    }
  }
  return on;
}

async function updateCommand(args, say) {
  const sub = args[0];
  if (sub === 'auto') {
    const arg = (args[1] || '').toLowerCase();
    if (arg && arg !== 'on' && arg !== 'off') throw new Error('update auto [on | off]');
    if (arg) {
      state.settings.data.autoUpdate = arg === 'on';
      state.settings.save();
    }
    const status = autoUpdateOn()
      ? t('vérification automatique au lancement : activée (Zenith et extensions)')
      : t('vérification automatique au lancement : désactivée (« update » et « ext » restent possibles à la main)');
    say(`  ${arg ? '✓ ' : ''}${status}`, arg ? 'ok' : '');
    return;
  }
  if (sub === '-v' || sub === 'versions') {
    await versionsCommand(args[1], say);
    return;
  }
  if (updater.installed()) {
    if (sub === 'electron') {
      say(t('  Electron est inclus dans l\'installateur : « update install » installe la dernière version publiée'), 'dim');
      return;
    }
    if (sub === 'install') {
      // Sans signature Apple, macOS refuse l'installation automatique : on ouvre la page de téléchargement.
      if (process.platform === 'darwin') {
        tabList.createTab({ url: updater.RELEASES_URL });
        say(t('  page des installateurs ouverte : télécharge le .dmg de la dernière version'), 'dim');
        return;
      }
      questions.ask(say, t('télécharger et installer la dernière version ? l\'appli redémarrera'), async (s) => {
        output.print([{ t: t('  téléchargement de l\'installateur…'), c: 'dim' }]);
        let last = -10;
        try {
          const started = await updater.installRelease((pct) => {
            if (pct - last >= 10 || pct === 100) {
              last = pct;
              output.print([{ t: `  ↓ ${pct} %`, c: 'dim' }]);
            }
          });
          if (!started) s(t('  ✓ déjà à jour'), 'ok');
        } catch (err) {
          s(t('  mise à jour impossible : {error}', { error: err.message }), 'err');
          tabList.createTab({ url: updater.RELEASES_URL });
          s(t('  page des installateurs ouverte pour la faire à la main'), 'dim');
        }
      });
      return;
    }
  } else if (sub === 'install' || sub === 'electron') {
    const what = sub === 'electron'
      ? t('passer à la dernière version majeure d\'Electron (peut casser des choses, à tester) ? l\'appli va se fermer puis se relancer')
      : t('mettre à jour l\'appli et Electron dans sa version actuelle ? l\'appli va se fermer puis se relancer');
    questions.ask(say, what, async (s) => {
      await updater.launchSource(sub === 'electron' ? 'electron' : 'app');
      s(t('  mise à jour lancée, l\'appli redémarre…'), 'ok');
      setTimeout(() => app.quit(), 600);
    });
    return;
  }
  say(t('  vérification…'), 'dim');
  const r = await updater.check();
  for (const l of updateLines(r)) say(l.t, l.c);
  await updateRecap(r, say);
}

// Récapitulatif de ce qu'apporte la mise à jour proposée : notes de chaque version publiée
// depuis celle installée, ou titres des commits en attente quand l'appli tourne depuis le code.
async function updateRecap(r, say) {
  if (!r.installed) {
    if (!r.commits || !r.commits.length) return;
    say(t('  au programme :'), 'dim');
    for (const c of r.commits) say(`  · ${c}`);
    if (r.behind > r.commits.length) say(t('  · … et {count} autres', { count: r.behind - r.commits.length }), 'dim');
    return;
  }
  if (!r.available) return;
  let releases = [];
  try {
    releases = await updater.listReleases();
  } catch {
    return; // la vérification a marché, seules les notes manquent
  }
  const lang = getLang();
  const wanted = releases.filter((x) => newer(x.version, r.current) && !newer(x.version, r.latest));
  if (!wanted.length) return;
  say(t('  au programme :'), 'dim');
  for (const x of wanted) {
    say(`  Zenith ${x.version}`, 'ok');
    const notes = exactNotes(x.version, lang) || releaseNotes(x.body, lang);
    if (notes.length) for (const n of notes) say(`  · ${n}`);
    else say(t('  pas de notes pour cette version'), 'dim');
  }
}

// « update -v » : liste les versions publiées ; un numéro affiche les notes de cette version
// puis propose de l'installer (plus récente ou plus ancienne).
async function versionsCommand(wanted, say) {
  const releases = await updater.listReleases();
  if (!releases.length) throw new Error(t('aucune version publiée sur GitHub'));
  const current = app.getVersion();
  if (wanted) {
    const r = releases.find((x) => x.version === wanted.replace(/^v/, ''));
    if (!r) throw new Error(t('pas de version {version} publiée (« update -v » pour la liste)', { version: wanted }));
    return showVersion(r, say);
  }
  say(t('  versions publiées (installée : {version})', { version: current }), 'dim');
  releases.forEach((r, i) => {
    const date = r.date ? new Date(r.date).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'fr-FR') : '';
    const mark = r.version === current ? t('  ← installée') : '';
    say(`  [${i + 1}] ${r.version}  ${date}${mark}`, r.version === current ? 'ok' : '');
  });
  const question = t('quelle version ? numéro (1-{max}), ou Entrée pour annuler', { max: releases.length });
  for (const l of questions.enqueue(question, async (input, s) => {
    const r = releases[Number(input) - 1];
    if (!input || !r) return s(t('  annulé'), 'dim');
    await showVersion(r, s);
  }, /^\d*$/)) say(l.t, l.c);
}

async function showVersion(r, say) {
  const lang = getLang();
  const notes = exactNotes(r.version, lang) || releaseNotes(r.body, lang);
  say(`  Zenith ${r.version}`, 'ok');
  if (notes.length) for (const n of notes) say(`  · ${n}`);
  else say(t('  pas de notes pour cette version'), 'dim');
  const current = app.getVersion();
  if (r.version === current) return say(t('  c\'est la version installée'), 'dim');
  if (!updater.installed()) return say(t('  appli lancée depuis le code : « update install » suit le dépôt, pas les versions publiées'), 'dim');
  if (process.platform === 'darwin') {
    tabList.createTab({ url: r.url });
    return say(t('  page de la version ouverte : télécharge son .dmg'), 'dim');
  }
  const older = newer(current, r.version);
  const question = older
    ? t('installer la version {version}, plus ancienne que la tienne ({current}) ? l\'appli redémarrera', { version: r.version, current })
    : t('installer la version {version} ? l\'appli redémarrera', { version: r.version });
  questions.ask(say, question, async (s) => {
    output.print([{ t: t('  téléchargement de l\'installateur…'), c: 'dim' }]);
    let last = -10;
    try {
      const started = await updater.installVersion(r.version, (pct) => {
        if (pct - last >= 10 || pct === 100) {
          last = pct;
          output.print([{ t: `  ↓ ${pct} %`, c: 'dim' }]);
        }
      });
      if (!started) s(t('  rien à installer pour cette version'), 'dim');
    } catch (err) {
      s(t('  installation impossible : {error}', { error: err.message }), 'err');
      tabList.createTab({ url: r.url });
      s(t('  page de la version ouverte pour l\'installer à la main'), 'dim');
    }
  });
}

function updateLines(r) {
  if (r.installed) {
    const lines = [{ t: `  Zenith ${r.current} (Electron ${process.versions.electron}, Chromium ${process.versions.chrome})` }];
    if (r.available) lines.push({ t: t('  ↑ nouvelle version publiée sur GitHub : {version} → « update install »', { version: r.latest }), c: 'warn' });
    else lines.push({ t: t('  ✓ à jour'), c: 'ok' });
    return lines;
  }
  const lines = [{ t: t('  Electron {electron} (Chromium {chrome}), lancé depuis le code', { electron: r.current, chrome: process.versions.chrome }) }];
  const patch = r.sameMajor !== r.current;
  if (patch) lines.push({ t: t('  ↑ correctifs disponibles : Electron {version} → « update install »', { version: r.sameMajor }), c: 'warn' });
  if (updater.major(r.latest) > updater.major(r.current)) {
    lines.push({ t: t('  ↑ nouvelle version majeure : Electron {version} → « update electron » (à tester)', { version: r.latest }), c: 'dim' });
  }
  if (r.behind) lines.push({ t: r.behind > 1 ? t('  ↑ {count} nouveaux commits sur le dépôt → « update install »', { count: r.behind }) : t('  ↑ 1 nouveau commit sur le dépôt → « update install »'), c: 'warn' });
  if (!patch && !r.behind) lines.push({ t: t('  ✓ à jour'), c: 'ok' });
  return lines;
}

// Au démarrage : compte rendu de la dernière mise à jour, puis vérification de l'appli
// et mise à jour des extensions, à chaque lancement.
function startupUpdateNotes() {
  const report = updater.lastReport();
  if (report) {
    const versions = report.before !== report.after ? ` (Electron ${report.before} → ${report.after})` : '';
    output.print([{ t: `  ${report.ok ? t('✓ mise à jour terminée') : t('✗ mise à jour incomplète')}${versions}`, c: report.ok ? 'ok' : 'err' }]);
    for (const step of report.steps.filter((st) => !st.ok)) output.print([{ t: `    ${step.cmd} : ${step.output}`, c: 'err' }]);
  }
  if (state.previousSession.length) output.print([{ t: state.previousSession.length > 1 ? t('  « popback » rouvre les {count} onglets de la dernière fois', { count: state.previousSession.length }) : t('  « popback » rouvre l\'onglet de la dernière fois'), c: 'dim' }]);
  if (updater.installed() && state.settings.data.lastVersion && state.settings.data.lastVersion !== app.getVersion()) {
    output.print([{ t: t('  ✓ Zenith mis à jour en {version}', { version: app.getVersion() }), c: 'ok' }]);
  }
  state.settings.data.lastVersion = app.getVersion();
  state.settings.save();
  // « update auto off » : ni vérification de l'appli ni mise à jour des extensions au lancement.
  if (!autoUpdateOn()) return;
  setTimeout(async () => {
    try {
      const r = await updater.check();
      output.print(updateLines(r).filter((l) => l.c === 'warn'));
    } catch {
      // hors ligne : on réessaiera au prochain démarrage
    }
    const results = await state.exts.updateAll();
    for (const u of results.filter((x) => !x.error)) output.print([{ t: t('  ✓ extension {name} mise à jour : {from} → {to}', u), c: 'ok' }]);
    const failed = results.filter((x) => x.error);
    if (failed.length) output.print([{ t: t('  mise à jour impossible pour {names} ({error})', { names: failed.map((x) => x.name).join(', '), error: failed[0].error }), c: 'dim' }]);
    ui.sendState();
  }, 8000);
}

Object.assign(module.exports, { updateCommand, startupUpdateNotes });
