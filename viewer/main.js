'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const core = require('./lib/converter-core');
const service = require('./lib/convert-service');

let mainWindow = null;
let activeCancelToken = null;
const sessionCleanups = new Set();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('converter.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('convert-progress', payload);
  }
}

function sendLog(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('convert-log', { message, type });
  }
}

ipcMain.handle('show-file-picker', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'Exports', extensions: ['json', 'zip'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'ZIP Archives', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    title: options?.title || 'Select Conversation Export'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('show-folder-picker', async (_event, options) => {
  let title = 'Select Folder';
  let defaultPath;
  if (typeof options === 'string') {
    defaultPath = options;
  } else if (options && typeof options === 'object') {
    title = options.title || 'Select Folder';
    defaultPath = options.defaultPath;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title,
    defaultPath: defaultPath || undefined
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// In-memory store of last loaded conversations for preview/convert
let loadedSession = null;

ipcMain.handle('load-export-session', async (_event, inputPath) => {
  let AdmZip = null;
  try {
    AdmZip = require('adm-zip');
  } catch {
    if (String(inputPath).toLowerCase().endsWith('.zip')) {
      throw new Error('ZIP support requires adm-zip. Run npm install in the viewer folder.');
    }
  }

  // Cleanup previous temp extract
  if (loadedSession?.cleanupDir) {
    try {
      fs.rmSync(loadedSession.cleanupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    sessionCleanups.delete(loadedSession.cleanupDir);
  }

  const loaded = await service.loadExportFromPath(inputPath, {
    AdmZip,
    onLog: (message, type) => sendLog(message, type)
  });

  loadedSession = loaded;
  if (loaded.cleanupDir) sessionCleanups.add(loaded.cleanupDir);

  const stats = await fs.promises.stat(loaded.jsonPath);
  const summaries = core.buildConversationSummaries(loaded.data, loaded.provider);

  return {
    provider: loaded.provider,
    providerLabel: core.providerLabel(loaded.provider),
    jsonPath: loaded.jsonPath,
    sourceDirectory: loaded.sourceDirectory,
    fileName: path.basename(loaded.jsonPath),
    fileSize: stats.size,
    conversationCount: loaded.data.length,
    summaries
  };
});

ipcMain.handle('preview-conversation', async (_event, index) => {
  if (!loadedSession) throw new Error('No export loaded');
  const conversation = loadedSession.data[index];
  if (!conversation) throw new Error('Conversation not found');
  const result = await core.createMarkdown(conversation, loadedSession.provider, {
    obsidianFrontmatter: false
  });
  const meta = core.getConversationMeta(conversation, loadedSession.provider);
  return {
    title: meta.title,
    date: core.formatDate(meta.createTime),
    markdown: result.markdown,
    messageCount: result.messageCount
  };
});

ipcMain.handle('start-convert', async (_event, payload) => {
  if (!loadedSession) throw new Error('No export loaded');
  if (activeCancelToken && !activeCancelToken.cancelled) {
    throw new Error('A conversion is already running');
  }

  activeCancelToken = service.createCancelToken();
  const {
    outputDir,
    selectedIndexes,
    options = {}
  } = payload || {};

  if (!outputDir) throw new Error('Output directory is required');

  try {
    const result = await service.convertConversations({
      conversations: loadedSession.data,
      provider: loadedSession.provider,
      outputDir,
      sourceDirectory: loadedSession.sourceDirectory,
      selectedIndexes,
      options,
      cancelToken: activeCancelToken,
      onLog: (message, type) => sendLog(message, type),
      onProgress: (progress) => sendProgress(progress)
    });
    return result;
  } finally {
    activeCancelToken = null;
  }
});

ipcMain.handle('cancel-convert', async () => {
  if (activeCancelToken) {
    activeCancelToken.cancel();
    sendLog('Cancel requested…', 'info');
    return true;
  }
  return false;
});

ipcMain.handle('get-provider-guide', async () => {
  return [
    {
      id: 'openai',
      title: 'ChatGPT (OpenAI)',
      steps: [
        'Open ChatGPT → Settings → Data controls → Export data',
        'Download the zip when email arrives',
        'Select the zip or unzipped folder here (contains conversations.json)'
      ]
    },
    {
      id: 'anthropic',
      title: 'Claude (Anthropic)',
      steps: [
        'Open Claude → Settings → Privacy → Export data',
        'Download the export zip',
        'Select the zip or folder containing conversations.json'
      ]
    },
    {
      id: 'gemini',
      title: 'Google Gemini',
      steps: [
        'Use Google Takeout and include Gemini Apps (or export JSON if available)',
        'Select the zip/folder; the app looks for GeminiApps.json / conversations.json'
      ]
    },
    {
      id: 'copilot',
      title: 'Microsoft Copilot',
      steps: [
        'Export your Copilot / Bing Chat history JSON if available from your account tools',
        'Select the JSON, zip, or folder containing copilot.json / conversations.json'
      ]
    }
  ];
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const dir of sessionCleanups) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  if (process.platform !== 'darwin') app.quit();
});
