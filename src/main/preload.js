'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brows', {
  lang: ipcRenderer.sendSync('ui:lang'),
  exec: (line, opts) => ipcRenderer.invoke('ui:exec', line, opts),
  complete: (line) => ipcRenderer.invoke('ui:complete', line),
  ready: () => ipcRenderer.send('ui:ready'),
  layout: (rects) => ipcRenderer.send('ui:layout', rects),
  drag: (on) => ipcRenderer.send('ui:drag', on),
  focusPage: () => ipcRenderer.send('ui:focus-page'),
  tab: (id) => ipcRenderer.send('ui:tab', id),
  closeTab: (id) => ipcRenderer.send('ui:tab-close', id),
  moveTab: (id, targetId) => ipcRenderer.send('ui:tab-move', id, targetId),
  devtools: (action) => ipcRenderer.send('ui:devtools', action),
  newTab: () => ipcRenderer.send('ui:tab-new'),
  pane: (i) => ipcRenderer.send('ui:pane', i),
  extPopup: (n, x) => ipcRenderer.send('ui:ext-popup', n, x),
  panel: (kind, x) => ipcRenderer.send('ui:panel', kind, x),
  tabMute: (id) => ipcRenderer.send('ui:tab-mute', id),
  volume: (v) => ipcRenderer.send('ui:volume', v),
  toggleMode: () => ipcRenderer.send('ui:mode'),
  readClipboard: () => ipcRenderer.invoke('ui:clipboard-read'),
  writeClipboard: (text) => ipcRenderer.send('ui:clipboard-write', text),
  resetZoom: () => ipcRenderer.send('ui:zoom-reset'),
  on: (channel, fn) => {
    if (!['state', 'term:print', 'term:focus', 'term:toggle', 'ui:panel'].includes(channel)) return;
    ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
