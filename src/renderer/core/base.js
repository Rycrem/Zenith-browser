'use strict';

const api = window.brows;
const { t, mark, setLang, getLang } = window.I18N;
setLang(api.lang);
const locale = () => (getLang() === 'en' ? 'en-US' : 'fr-FR');
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const content = $('#content');
const panesEl = [...document.querySelectorAll('.pane')];
// Un terminal sous chaque écran : en split, chacun a sa ligne de commande.
const cols = [...document.querySelectorAll('.term-col')].map((el) => ({ el, scrollback: $('.scrollback', el), form: $('.prompt', el), input: $('.input', el), ps1: $('.ps1', el) }));

let state = null;
const activeCol = () => cols[state && cols[state.activePane] ? state.activePane : 0];
const isField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
let awaiting = false; // « (O/n) » ou « (o/N) » (« (Y/n) » en anglais) quand une question attend une réponse
const cmdHistory = load('cmdHistory', []);
let histIndex = cmdHistory.length;

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : tant pis
  }
}

// Petit constructeur d'éléments : h('div', { class: 'x', onclick }, 'texte', enfant…)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
