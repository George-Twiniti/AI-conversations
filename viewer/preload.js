'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  showFilePicker: (options) => ipcRenderer.invoke('show-file-picker', options),
  showFolderPicker: (options) => ipcRenderer.invoke('show-folder-picker', options),

  loadExportSession: (inputPath) => ipcRenderer.invoke('load-export-session', inputPath),
  previewConversation: (index) => ipcRenderer.invoke('preview-conversation', index),
  startConvert: (payload) => ipcRenderer.invoke('start-convert', payload),
  cancelConvert: () => ipcRenderer.invoke('cancel-convert'),
  getProviderGuide: () => ipcRenderer.invoke('get-provider-guide'),

  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || null;
    }
  },

  onConvertProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('convert-progress', listener);
    return () => ipcRenderer.removeListener('convert-progress', listener);
  },

  onConvertLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('convert-log', listener);
    return () => ipcRenderer.removeListener('convert-log', listener);
  }
});
