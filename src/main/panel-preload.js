'use strict';

// Pont des popups de la barre du bas (téléchargements, favoris) : reçoit leurs données,
// demande une action au processus principal, donne la hauteur voulue.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panel', {
  onData: (fn) => ipcRenderer.on('panel:data', (e, data) => fn(data)),
  act: (action, arg) => ipcRenderer.send('panel:act', action, arg),
  size: (height) => ipcRenderer.send('panel:size', height),
});
