'use strict';

// Commun aux popups : couleurs de Zenith (accent, mode jour, navigation privée) passées dans l'adresse,
// et h() qui construit un élément sans jamais interpréter de HTML.
{
  const params = new URLSearchParams(location.search);
  const accent = params.get('accent');
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--accent', accent);
  if (params.get('mode') === 'jour') document.documentElement.dataset.mode = 'jour';
  if (params.get('private')) document.documentElement.dataset.private = '1';
}

const $ = (sel) => document.querySelector(sel);

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
