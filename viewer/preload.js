const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Show file picker dialog
  showFilePicker: async (options) => {
    return await ipcRenderer.invoke('show-file-picker', options);
  },

  // Show folder picker dialog
  showFolderPicker: async (options) => {
    return await ipcRenderer.invoke('show-folder-picker', options);
  },

  // Read JSON file
  readJsonFile: async (filePath) => {
    return await ipcRenderer.invoke('read-json-file', filePath);
  },

  // Write markdown file
  writeMarkdownFile: async (filePath, content) => {
    return await ipcRenderer.invoke('write-markdown-file', filePath, content);
  },

  // Check if file exists
  fileExists: async (filePath) => {
    return await ipcRenderer.invoke('file-exists', filePath);
  },

  // Get file stats
  getFileStats: async (filePath) => {
    return await ipcRenderer.invoke('get-file-stats', filePath);
  },

  // Join path segments
  joinPath: async (...segments) => {
    return await ipcRenderer.invoke('join-path', ...segments);
  },

  // Read directory contents
  readDirectory: async (dirPath) => {
    return await ipcRenderer.invoke('read-directory', dirPath);
  },

  // Copy file
  copyFile: async (sourcePath, destPath) => {
    return await ipcRenderer.invoke('copy-file', sourcePath, destPath);
  },

  // Copy directory recursively
  copyDirectory: async (sourcePath, destPath) => {
    return await ipcRenderer.invoke('copy-directory', sourcePath, destPath);
  },

  // Find files matching pattern
  findFiles: async (dirPath, pattern) => {
    return await ipcRenderer.invoke('find-files', dirPath, pattern);
  },

  // Check if running in Electron
  isElectron: true
});
