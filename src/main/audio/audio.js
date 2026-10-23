'use strict';

const state = require('../state');
const ui = require('../window/ui');
const panels = require('../panels/panels');

// Volume : celui du navigateur (réglages) multiplié par celui de l'onglet, appliqué aux
// éléments <audio> et <video> de toutes les frames. À 100 %, rien n'est touché.
const MEDIA_SCRIPT = `((action, volume) => {
  const st = window.__devBrowsAudio || (window.__devBrowsAudio = { volume: 1, last: [] });
  const all = () => [...document.querySelectorAll('video, audio')];
  if (!st.hooked) {
    st.hooked = true;
    document.addEventListener('play', (e) => {
      if (st.volume !== 1 && e.target && 'volume' in e.target) e.target.volume = st.volume;
    }, true);
  }
  if (action === 'volume') {
    const changed = st.volume !== volume;
    st.volume = volume;
    if (changed) for (const el of all()) el.volume = volume;
    return null;
  }
  if (action === 'toggle') {
    const playing = all().filter((el) => !el.paused);
    if (playing.length) {
      for (const el of playing) el.pause();
      st.last = playing;
      return 'paused';
    }
    const el = st.last.find((x) => x.isConnected) || all().find((x) => x.currentTime > 0) || all()[0];
    if (!el) return null;
    el.play().catch(() => {});
    return 'playing';
  }
  return all().some((el) => !el.paused) ? 'playing' : all().some((el) => el.currentTime > 0) ? 'paused' : null;
})`;

const isMuted = (tab) => !!(tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.isAudioMuted());
const tabVolume = (tab) => (tab.volume === undefined ? 1 : tab.volume);
const globalVolume = () => (state.settings.data.volume === undefined ? 1 : state.settings.data.volume);

// Exécute MEDIA_SCRIPT dans chaque frame de l'onglet ; renvoie le résultat de la première qui répond.
async function mediaCall(tab, action, value) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return null;
  let result = null;
  for (const frame of tab.view.webContents.mainFrame.framesInSubtree) {
    try {
      const r = await frame.executeJavaScript(`${MEDIA_SCRIPT}(${JSON.stringify(action)}, ${Number(value) || 0})`, true);
      if (r && !result) result = r;
    } catch {}
  }
  return result;
}

function applyVolume(tab) {
  const v = Math.round(globalVolume() * tabVolume(tab) * 100) / 100;
  if (v === 1 && !tab.volumeSet) return;
  tab.volumeSet = v !== 1;
  mediaCall(tab, 'volume', v);
}

// Onglets qui jouent du son ou ont un média en cours (lecture ou pause).
function audioTabs() {
  return state.tabs.filter((t) => t.view && (t.audible || t.media));
}

// Le player disparaît quand plus aucun onglet ne joue de son ; il reste pour un média mis en pause
// avec son bouton, qu'on puisse le reprendre.
function audioState() {
  const list = audioTabs();
  return {
    show: list.some((t) => t.media === 'playing' || t.audible || t.pausedByPlayer),
    playing: list.some((t) => t.media === 'playing' || t.audible),
    volume: globalVolume(),
    muted: !!state.settings.data.muteAll,
  };
}

let audioTimer = null;
function audioChanged() {
  // Les événements arrivent par rafales (plusieurs frames) : un seul envoi.
  clearTimeout(audioTimer);
  audioTimer = setTimeout(() => {
    ui.sendStateAll(); // le volume et « couper tout » valent pour toutes les fenêtres
    panels.sendPanel('audio');
  }, 50);
}

function setMuted(tab, muted) {
  if (!tab.view) return;
  tab.view.webContents.setAudioMuted(muted);
  audioChanged();
}

function setGlobalVolume(v) {
  state.settings.data.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  state.settings.save();
  for (const tab of state.allTabs()) applyVolume(tab);
  audioChanged();
}

// « Couper tout » coupe chaque onglet ; le rétablir rend le son à ceux qu'il avait coupés.
function setMuteAll(on) {
  state.settings.data.muteAll = on;
  state.settings.save();
  for (const tab of state.allTabs()) {
    if (!tab.view) continue;
    if (on && !isMuted(tab)) {
      tab.mutedByAll = true;
      tab.view.webContents.setAudioMuted(true);
    } else if (!on && tab.mutedByAll) {
      tab.mutedByAll = false;
      tab.view.webContents.setAudioMuted(false);
    }
  }
  audioChanged();
}

// Bouton lecture/pause du player : met en pause tout ce qui joue, sinon reprend le dernier mis en pause.
async function togglePlayAll() {
  const list = audioTabs();
  const playing = list.filter((t) => t.media === 'playing' || (!t.media && t.audible));
  if (playing.length) {
    for (const t of playing) await togglePlay(t);
    return;
  }
  const last = list.filter((t) => t.media === 'paused').sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0))[0];
  if (last) await togglePlay(last);
}

async function togglePlay(tab) {
  const r = await mediaCall(tab, 'toggle');
  if (r) tab.media = r;
  tab.pausedByPlayer = r === 'paused';
  audioChanged();
}

Object.assign(module.exports, { isMuted, tabVolume, globalVolume, applyVolume, audioTabs, audioState, audioChanged, setMuted, setGlobalVolume, setMuteAll, togglePlayAll, togglePlay });
