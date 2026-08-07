const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('converter.html');
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle file picker dialog (for JSON input)
ipcMain.handle('show-file-picker', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    title: options?.title || 'Select Conversation Export File'
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// Handle folder picker dialog (for source or output directory)
ipcMain.handle('show-folder-picker', async (event, options) => {
  // Support both old format (just defaultPath) and new format (options object)
  let title = 'Select Folder';
  let defaultPath = undefined;
  
  if (typeof options === 'string') {
    // Old format: just a path string
    defaultPath = options;
  } else if (options && typeof options === 'object') {
    // New format: options object
    title = options.title || 'Select Folder';
    defaultPath = options.defaultPath;
  }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: title,
    defaultPath: defaultPath || undefined
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// Read JSON file
ipcMain.handle('read-json-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read JSON file: ${error.message}`);
  }
});

// Write markdown file
ipcMain.handle('write-markdown-file', async (event, filePath, content) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
    return true;
  } catch (error) {
    throw new Error(`Failed to write markdown file: ${error.message}`);
  }
});

// Check if file exists
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
});

// Get file stats
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modified: stats.mtime.getTime()
    };
  } catch (error) {
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
});

// Join path segments
ipcMain.handle('join-path', async (event, ...segments) => {
  return path.join(...segments);
});

// Read directory contents
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name)
    }));
  } catch (error) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }
});

// Copy file
ipcMain.handle('copy-file', async (event, sourcePath, destPath) => {
  try {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(sourcePath, destPath);
    return true;
  } catch (error) {
    throw new Error(`Failed to copy file: ${error.message}`);
  }
});

// Helper function to copy directory recursively
async function copyDirectoryRecursive(sourcePath, destPath) {
  await fs.promises.mkdir(destPath, { recursive: true });
  const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourceEntry = path.join(sourcePath, entry.name);
    const destEntry = path.join(destPath, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourceEntry, destEntry);
    } else {
      await fs.promises.copyFile(sourceEntry, destEntry);
    }
  }
}

// Copy directory recursively
ipcMain.handle('copy-directory', async (event, sourcePath, destPath) => {
  try {
    await copyDirectoryRecursive(sourcePath, destPath);
    return true;
  } catch (error) {
    throw new Error(`Failed to copy directory: ${error.message}`);
  }
});

// Helper function to find files recursively
async function findFilesRecursive(dirPath, pattern, results = []) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile() && entry.name.includes(pattern)) {
      results.push(fullPath);
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await findFilesRecursive(fullPath, pattern, results);
    }
  }
  return results;
}

// Find files matching pattern
ipcMain.handle('find-files', async (event, dirPath, pattern) => {
  try {
    return await findFilesRecursive(dirPath, pattern);
  } catch (error) {
    throw new Error(`Failed to find files: ${error.message}`);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
