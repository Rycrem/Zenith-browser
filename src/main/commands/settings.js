'use strict';

const { app } = require('electron');
const C = require('../../shared/commands');
const { t, getLang } = require('../../shared/i18n');
const state = require('../state');
const theme = require('../window/theme');
const screens = require('../terminal/screens');
const updates = require('../updates/update-command');
const ai = require('../ai/providers');
const keys = require('./keys');
const menu = require('../window/menu');
const K = require('../../shared/shortcuts');
const tabPreview = require('../tabs/preview');

// Page des réglages (« settings [page] », bouton ⚙ en bas à droite). Un volet à gauche liste les
// pages : les réglages généraux, puis une page par commande qui a des réglages. Chaque choix ou
// champ lance sa commande dans le terminal, et la page se met à jour.
// Une nouvelle commande qui a des réglages doit avoir sa page ici (PAGES, TITLES et BUILD).
// Les raccourcis ont une sous-page par catégorie (keys-tabs…), sous « Raccourcis » qui les montre toutes.
const KEY_PAGES = K.GROUPS.map((g) => `keys-${g.id}`);
const PAGES = ['general', 'keys', ...KEY_PAGES, 'ia', 'alias', 'ext', 'perm', 'update'];

const opt = (label, cmd, on) => ({ label, cmd, on: !!on });
// Formulaire : des champs, et la commande où {0}, {1}… sont remplacés par leur valeur.
const form = (template, fields, button) => ({ template, fields, button });

function general() {
  const d = state.settings.data;
  const light = theme.isLight();
  const gpu = d.gpu !== false;
  const custom = /^#[0-9a-f]{6}$/i.test(d.theme || '');
  return [
    { label: t('Mode'), options: [opt(t('nuit'), 'mode nuit', !light), opt(t('jour'), 'mode jour', light)] },
    {
      label: process.platform === 'win32' ? t('Suivre le thème de Windows') : t('Suivre le thème du système'),
      hint: t('clair ou sombre'),
      options: [opt(t('activé'), 'mode systeme', theme.followsSystem()), opt(t('désactivé'), light ? 'mode jour' : 'mode nuit', !theme.followsSystem())],
    },
    {
      label: t('Couleur d\'accent'),
      options: [...Object.keys(theme.THEMES).map((k) => opt(k, `theme ${k}`, d.theme === k)), ...(custom ? [opt(d.theme, `theme ${d.theme}`, true)] : [])],
      form: form('theme {0}', [{ type: 'color', value: theme.accentColor(), title: t('Choisir une autre couleur') }]),
    },
    { label: t('Langue'), options: [opt('français', 'lang fr', getLang() === 'fr'), opt('English', 'lang en', getLang() === 'en')] },
    { label: t('Moteur de recherche'), options: Object.entries(C.ENGINES).map(([k, e]) => opt(e.label, `engine ${k}`, d.engine === k)) },
    {
      label: t('Aperçu des onglets'),
      hint: t('au survol, après {s} s', { s: tabPreview.delay() }),
      options: [opt(t('activé'), 'preview on', tabPreview.enabled()), opt(t('désactivé'), 'preview off', !tabPreview.enabled())],
      form: form('preview {0}', [{ placeholder: t('secondes'), title: t('Temps de survol avant l\'aperçu, en secondes') }], t('changer')),
    },
    { label: t('Fermer le dernier onglet'), options: [opt(t('quitte Zenith'), 'lasttab quit', d.quitOnLastTab !== false), opt(t('garde un onglet d\'accueil'), 'lasttab keep', d.quitOnLastTab === false)] },
    { label: t('Accélération matérielle'), hint: t('relance Zenith'), options: [opt(t('activée'), 'gpu on', gpu), opt(t('désactivée'), 'gpu off', !gpu)] },
    { label: t('Navigateur par défaut'), options: [opt(t('faire de Zenith le navigateur par défaut'), 'default')] },
    { label: t('Sauvegarde'), hint: t('réglages, favoris et extensions'), options: [opt(t('exporter'), 'config export'), opt(t('importer'), 'config import')] },
  ];
}

function iaPage() {
  const rows = ai.list(state.settings).map((r) => ({
    label: r.name,
    hint: `${r.model} · ${r.key}${r.free ? t(' · gratuit') : ''}`,
    options: [opt(r.current ? t('● actuelle') : t('choisir'), `ia use ${r.id}`, r.current)],
  }));
  const cur = ai.PROVIDERS[ai.current(state.settings)];
  return [
    ...rows,
    { label: t('Modèle de {name}', { name: t(cur.name) }), form: form('ia model {0}', [{ placeholder: ai.model(state.settings, ai.current(state.settings)) }], t('changer')), options: [opt(t('par défaut'), 'ia model default')] },
    cur.noKey ? null : { label: t('Clé de {name}', { name: t(cur.name) }), form: form('ia key {0}', [{ type: 'password', placeholder: t('coller la clé') }], t('enregistrer')), options: [opt(t('retirer la clé'), 'ia logout')] },
  ].filter(Boolean);
}

function aliasPage() {
  return [
    ...Object.entries(state.settings.data.aliases).map(([k, v]) => ({ label: k, hint: `= ${v}`, options: [opt(t('supprimer'), `unalias ${k}`)] })),
    { label: t('Nouvel alias'), form: form('alias {0} = {1}', [{ placeholder: t('nom') }, { placeholder: t('commande (ex. brows youtube)'), wide: true }], t('ajouter')) },
  ];
}

function extPage() {
  return [
    ...state.exts.summary().map((e) => ({
      label: e.name || e.alias,
      icon: e.icon,
      hint: `${e.alias}${menu.keyLabel(`ext-${e.n}`) ? ` · ${menu.keyLabel(`ext-${e.n}`)}` : ''}${e.error ? ` · ${e.error}` : ''}`,
      options: [
        opt(t('activée'), `ext on ${e.n}`, e.enabled),
        opt(t('désactivée'), `ext off ${e.n}`, !e.enabled),
        opt(e.pinned ? t('★ épinglée') : t('☆ épingler'), `ext pin ${e.n}`, e.pinned),
        opt(t('désinstaller'), `ext rm ${e.n}`),
      ],
    })),
    { label: t('Ajouter une extension'), form: form('ext add {0}', [{ placeholder: t('lien du Chrome Web Store ou identifiant'), wide: true }], t('installer')) },
  ];
}

function permPage() {
  const saved = Object.entries(state.settings.data.permissions || {});
  return [
    ...saved.map(([origin, perms]) => ({
      label: origin,
      hint: Object.entries(perms).map(([k, v]) => `${v ? '✓' : '✗'} ${k}`).join(', '),
      options: [opt(t('effacer'), `perm reset ${origin}`)],
    })),
    saved.length ? { label: t('Tous les sites'), options: [opt(t('tout effacer'), 'perm reset')] } : { label: t('Aucune autorisation enregistrée.') },
  ];
}

function updatePage() {
  const auto = updates.autoUpdateOn();
  return [
    { label: t('Version installée'), hint: app.getVersion(), options: [opt(t('vérifier'), 'update'), opt(t('nouveautés'), 'update -v')] },
    { label: t('Mises à jour automatiques'), hint: t('vérifiées au lancement'), options: [opt(t('activées'), 'update auto on', auto), opt(t('désactivées'), 'update auto off', !auto)] },
  ];
}

const TITLES = {
  general: 'Général', keys: 'Raccourcis (keys)', ia: 'IA (ia)', alias: 'Alias', ext: 'Extensions (ext)', perm: 'Autorisations (perm)', update: 'Mises à jour (update)',
};
for (const g of K.GROUPS) TITLES[`keys-${g.id}`] = g.label;
const BUILD = { general, keys: () => keys.keysPage(), ia: iaPage, alias: aliasPage, ext: extPage, perm: permPage, update: updatePage };
for (const g of K.GROUPS) BUILD[`keys-${g.id}`] = () => keys.keysPage(g.id);

function showSettings(tab, page = 'general') {
  const id = PAGES.includes(page) ? page : 'general';
  const rows = BUILD[id]();
  screens.setScreen(tab, {
    kind: 'settings',
    page: id,
    pages: PAGES.map((p) => ({ id: p, label: t(TITLES[p]), sub: p === 'general' ? 0 : KEY_PAGES.includes(p) ? 2 : 1 })),
    rows,
    // Pour la barre de recherche : les lignes de toutes les pages (les sous-pages des raccourcis
    // sont déjà dans « Raccourcis »).
    index: PAGES.filter((p) => !KEY_PAGES.includes(p)).map((p) => ({ id: p, label: t(TITLES[p]), rows: (p === id ? rows : BUILD[p]()).filter((r) => !r.heading) })),
  });
}

// Raccourci : page suivante ou précédente des réglages affichés. false s'ils ne sont pas affichés.
function cyclePage(tab, dir) {
  if (!tab || !tab.screen || tab.screen.kind !== 'settings') return false;
  const i = PAGES.indexOf(tab.screen.page);
  showSettings(tab, PAGES[(i + dir + PAGES.length) % PAGES.length]);
  return true;
}

// Après une commande lancée depuis la page, elle montre les nouveaux choix.
function refreshSettings(tab) {
  if (tab && tab.screen && tab.screen.kind === 'settings') showSettings(tab, tab.screen.page);
}

Object.assign(module.exports, { showSettings, refreshSettings, cyclePage, PAGES });
