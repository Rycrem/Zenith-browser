'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brows', {
  exec: (line) => ipcRenderer.invoke('ui:exec', line),
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
  readClipboard: () => ipcRenderer.invoke('ui:clipboard-read'),
  writeClipboard: (text) => ipcRenderer.send('ui:clipboard-write', text),
  on: (channel, fn) => {
    if (!['state', 'term:print', 'term:focus', 'term:toggle'].includes(channel)) return;
    ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
