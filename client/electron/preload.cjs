'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  onEvent: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('api:event', listener);
    return () => ipcRenderer.off('api:event', listener);
  },
  onEventError: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('api:event-error', listener);
    return () => ipcRenderer.off('api:event-error', listener);
  },
  onDiscordAuth: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('auth:discord-code', listener);
    return () => ipcRenderer.off('auth:discord-code', listener);
  },
  onDiscordResult: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('auth:discord-result', listener);
    return () => ipcRenderer.off('auth:discord-result', listener);
  },
});
