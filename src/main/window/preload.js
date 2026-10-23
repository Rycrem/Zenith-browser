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
  moveTab: (id, gap) => ipcRenderer.send('ui:tab-move', id, gap),
  moveTabToPane: (id, idx, pos) => ipcRenderer.send('ui:tab-to-pane', id, idx, pos),
  detachTab: (id, sx, sy, ox, oy) => ipcRenderer.send('ui:tab-detach', id, sx, sy, ox, oy),
  dragTabWindow: (sx, sy) => ipcRenderer.send('ui:tab-drag-move', sx, sy),
  dropTab: (id, sx, sy) => ipcRenderer.send('ui:tab-drop', id, sx, sy),
  devtools: (action) => ipcRenderer.send('ui:devtools', action),
  newTab: (pane) => ipcRenderer.send('ui:tab-new', pane),
  navTab: (pane, dir) => ipcRenderer.send('ui:tab-nav', pane, dir),
  mouseNav: (dir) => ipcRenderer.send('ui:mouse-nav', dir),
  pane: (i) => ipcRenderer.send('ui:pane', i),
  extPopup: (n, x) => ipcRenderer.send('ui:ext-popup', n, x),
  panel: (kind, x) => ipcRenderer.send('ui:panel', kind, x),
  tabMute: (id) => ipcRenderer.send('ui:tab-mute', id),
  volume: (v) => ipcRenderer.send('ui:volume', v),
  toggleMode: () => ipcRenderer.send('ui:mode'),
  mediaToggle: () => ipcRenderer.send('ui:media-toggle'),
  suggest: (text, rect) => ipcRenderer.invoke('ui:suggest', text, rect),
  suggestSelect: (i, rect) => ipcRenderer.send('ui:suggest-select', i, rect),
  suggestHide: () => ipcRenderer.send('ui:suggest-hide'),
  muteAll: () => ipcRenderer.send('ui:mute-all'),
  readClipboard: () => ipcRenderer.invoke('ui:clipboard-read'),
  writeClipboard: (text) => ipcRenderer.send('ui:clipboard-write', text),
  resetZoom: () => ipcRenderer.send('ui:zoom-reset'),
  aiReply: (text) => ipcRenderer.send('ui:ai-reply', text),
  recentMenu: () => ipcRenderer.send('ui:recent-menu'),
  findResult: (r) => ipcRenderer.send('ui:find-result', r),
  on: (channel, fn) => {
    if (!['state', 'term:print', 'term:focus', 'term:toggle', 'term:clear', 'ui:panel', 'ui:find', 'suggest:done'].includes(channel)) return;
    ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
