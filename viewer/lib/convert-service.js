'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('./converter-core');

const EXPORT_JSON_NAMES = [
  'conversations.json',
  'chat.html', // not parsed as json; skipped by finder for json
  'GeminiApps.json',
  'gemini.json',
  'copilot.json',
  'conversations.json.json'
];

function createCancelToken() {
  return { cancelled: false, cancel() { this.cancelled = true; } };
}

async function pathExists(target) {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function walkFiles(dirPath, { maxDepth = 8, onEntry } = {}, depth = 0, results = []) {
  if (depth > maxDepth) return results;
  let entries;
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (typeof onEntry === 'function') {
      onEntry(fullPath, entry);
    }
    if (entry.isDirectory()) {
      await walkFiles(fullPath, { maxDepth, onEntry }, depth + 1, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

async function findConversationsJson(rootDir) {
  const preferredNames = [
    'conversations.json',
    'GeminiApps.json',
    'gemini.json',
    'copilot.json'
  ];

  for (const name of preferredNames) {
    const direct = path.join(rootDir, name);
    if (await pathExists(direct)) {
      return direct;
    }
  }

  const matches = [];
  await walkFiles(rootDir, {
    maxDepth: 6,
    onEntry(fullPath, entry) {
      if (!entry.isFile()) return;
      const base = entry.name.toLowerCase();
      if (
        base === 'conversations.json' ||
        base === 'geminiapps.json' ||
        base === 'gemini.json' ||
        base === 'copilot.json'
      ) {
        matches.push(fullPath);
      }
    }
  });

  if (matches.length === 0) {
    // Fallback: any large-ish .json that looks like conversations
    const candidates = [];
    await walkFiles(rootDir, {
      maxDepth: 4,
      onEntry(fullPath, entry) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
          candidates.push(fullPath);
        }
      }
    });
    for (const candidate of candidates.slice(0, 20)) {
      try {
        const data = await readJsonFile(candidate);
        core.detectProvider(data);
        return candidate;
      } catch {
        // keep looking
      }
    }
    return null;
  }

  // Prefer conversations.json closest to root
  matches.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return matches[0];
}

function extractFileArtifactId(fileName) {
  return core.parseFileArtifactId(fileName);
}

async function buildArtifactMap(sourceDir, { onLog } = {}) {
  const artifactMap = {};
  if (!sourceDir) return artifactMap;

  const log = (msg, type = 'info') => {
    if (typeof onLog === 'function') onLog(msg, type);
  };

  log(`Scanning for artifacts in: ${sourceDir}`);

  await walkFiles(sourceDir, {
    maxDepth: 10,
    onEntry(fullPath, entry) {
      const name = entry.name;
      if (entry.isDirectory() && name.startsWith('file-') && name.endsWith('_data')) {
        const baseName = name.replace(/_data$/, '');
        const fileId = extractFileArtifactId(baseName) || baseName;
        if (fileId && !artifactMap[fileId]) {
          artifactMap[fileId] = fullPath;
        }
        return;
      }
      if (!entry.isFile()) return;
      if (!name.toLowerCase().startsWith('file-')) return;
      const fileId = extractFileArtifactId(name);
      if (fileId && !artifactMap[fileId]) {
        artifactMap[fileId] = fullPath;
      }
    }
  });

  // Also map dalle-generations explicitly (already covered by walk, but log count)
  const dalleCount = Object.values(artifactMap).filter(p =>
    String(p).replace(/\\/g, '/').toLowerCase().includes('dalle-generations')
  ).length;

  log(`Found ${Object.keys(artifactMap).length} artifacts (${dalleCount} from dalle-generations)`, 'success');
  return artifactMap;
}

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

function createAttachmentResolver({ artifactMap, outputDir, onLog }) {
  return async function resolveAttachment(attachment, conversationKey) {
    const fileId = attachment.id;
    const sourcePath = fileId ? artifactMap[fileId] : null;
    if (!sourcePath) return null;

    const conversationArtifactsDir = path.join(outputDir, 'artifacts', conversationKey);
    await fs.promises.mkdir(conversationArtifactsDir, { recursive: true });

    let stats;
    try {
      stats = await fs.promises.stat(sourcePath);
    } catch (error) {
      if (onLog) onLog(`Could not stat artifact ${fileId}: ${error.message}`, 'error');
      return null;
    }

    if (stats.isDirectory()) {
      const folderName = `${fileId}_${core.sanitizeFilename(attachment.name || 'data')}`;
      const destFolderPath = path.join(conversationArtifactsDir, folderName);
      await copyDirectoryRecursive(sourcePath, destFolderPath);
      const relativePath = `artifacts/${conversationKey}/${folderName}/`;
      return {
        copied: true,
        markdown: `📁 [${attachment.name || 'Data Folder'}](${relativePath})\n\n`
      };
    }

    let ext = '';
    const sourceExtMatch = sourcePath.match(/\.([a-zA-Z0-9]+)$/i);
    if (sourceExtMatch) {
      ext = `.${sourceExtMatch[1].toLowerCase()}`;
    } else if (attachment.mime_type) {
      ext = core.getExtensionFromMime(attachment.mime_type);
    } else if (attachment.name) {
      const nameExtMatch = attachment.name.match(/\.([a-zA-Z0-9]+)$/i);
      if (nameExtMatch) ext = `.${nameExtMatch[1].toLowerCase()}`;
    }

    const baseName = core.sanitizeFilename(attachment.name || fileId).replace(/\.[^.]+$/, '');
    const fileName = `${fileId}_${baseName}${ext}`;
    const destPath = path.join(conversationArtifactsDir, fileName);
    await fs.promises.copyFile(sourcePath, destPath);

    const mimeType = attachment.mime_type || '';
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'];
    const isImage = mimeType.startsWith('image/') || imageExtensions.includes(ext.toLowerCase());
    const relativePath = `artifacts/${conversationKey}/${fileName}`;
    return {
      copied: true,
      markdown: isImage
        ? `![${attachment.name || 'Image'}](${relativePath})\n\n`
        : `📎 [${attachment.name || 'Attachment'}](${relativePath})\n\n`
    };
  };
}

async function extractZipToTemp(zipPath, AdmZip) {
  const zip = new AdmZip(zipPath);
  const dest = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ai-conversations-'));
  zip.extractAllTo(dest, true);
  return dest;
}

async function loadExportFromPath(inputPath, { AdmZip, onLog } = {}) {
  const stats = await fs.promises.stat(inputPath);
  let workingDir = null;
  let jsonPath = null;
  let cleanupDir = null;

  if (stats.isFile() && inputPath.toLowerCase().endsWith('.zip')) {
    if (!AdmZip) throw new Error('ZIP support requires the adm-zip package');
    if (onLog) onLog(`Extracting zip: ${inputPath}`);
    cleanupDir = await extractZipToTemp(inputPath, AdmZip);
    workingDir = cleanupDir;
    jsonPath = await findConversationsJson(workingDir);
    if (!jsonPath) {
      throw new Error('No conversations JSON found inside the zip archive');
    }
  } else if (stats.isDirectory()) {
    workingDir = inputPath;
    jsonPath = await findConversationsJson(workingDir);
    if (!jsonPath) {
      throw new Error('conversations.json (or Gemini/Copilot JSON) not found in selected folder');
    }
  } else if (stats.isFile() && inputPath.toLowerCase().endsWith('.json')) {
    jsonPath = inputPath;
    workingDir = path.dirname(inputPath);
  } else {
    throw new Error('Please select a folder, .zip export, or conversations JSON file');
  }

  const data = await readJsonFile(jsonPath);
  const conversations = core.normalizeConversationsArray(data);
  if (!conversations) {
    throw new Error('Invalid file format: Expected an array of conversations');
  }
  const provider = core.detectProvider(data);

  return {
    data: conversations,
    rawData: data,
    provider,
    jsonPath,
    sourceDirectory: workingDir,
    cleanupDir
  };
}

/**
 * Convert selected conversations to markdown files.
 */
async function convertConversations({
  conversations,
  provider,
  outputDir,
  sourceDirectory = null,
  selectedIndexes = null,
  options = {},
  cancelToken = null,
  onProgress = null,
  onLog = null
}) {
  const log = (message, type = 'info') => {
    if (typeof onLog === 'function') onLog(message, type);
  };

  await fs.promises.mkdir(outputDir, { recursive: true });

  let artifactMap = {};
  if (sourceDirectory && provider === core.PROVIDERS.openai) {
    artifactMap = await buildArtifactMap(sourceDirectory, { onLog: log });
  } else {
    log(`${core.providerLabel(provider)}: skipping local file-* artifact scan`);
  }

  const resolveAttachment = createAttachmentResolver({
    artifactMap,
    outputDir,
    onLog: log
  });

  const indexes =
    Array.isArray(selectedIndexes) && selectedIndexes.length > 0
      ? selectedIndexes
      : conversations.map((_, i) => i);

  const total = indexes.length;
  let processed = 0;
  let success = 0;
  let errors = 0;
  let skipped = 0;
  const indexEntries = [];
  const existingFileOption = options.existingFileOption || 'rename';

  for (const index of indexes) {
    if (cancelToken?.cancelled) {
      log('Conversion cancelled by user', 'error');
      break;
    }

    const conversation = conversations[index];
    if (!conversation) {
      errors++;
      processed++;
      continue;
    }

    try {
      const meta = core.getConversationMeta(conversation, provider);
      const paths = core.conversationOutputPath(meta, {
        dateFolders: Boolean(options.dateFolders)
      });

      const targetDir = paths.relativeDir
        ? path.join(outputDir, paths.relativeDir)
        : outputDir;
      await fs.promises.mkdir(targetDir, { recursive: true });

      let fileName = paths.fileName;
      let filePath = path.join(targetDir, fileName);
      let relativePath = paths.relativePath;
      let shouldSkip = false;

      if (await pathExists(filePath)) {
        if (existingFileOption === 'skip') {
          shouldSkip = true;
          skipped++;
          log(`Skipped (exists): ${relativePath}`);
        } else if (existingFileOption === 'rename') {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
          fileName = `${paths.conversationKey}_${timestamp}.md`;
          filePath = path.join(targetDir, fileName);
          relativePath = paths.relativeDir ? `${paths.relativeDir}/${fileName}` : fileName;
          log(`File exists, renamed to: ${relativePath}`);
        } else {
          log(`Overwriting existing file: ${relativePath}`);
        }
      }

      if (!shouldSkip) {
        const result = await core.createMarkdown(conversation, provider, {
          obsidianFrontmatter: Boolean(options.obsidianFrontmatter),
          conversationKey: paths.conversationKey,
          resolveAttachment
        });

        await fs.promises.writeFile(filePath, result.markdown, 'utf8');
        success++;
        indexEntries.push({
          title: meta.title || 'untitled',
          date: core.formatDate(meta.createTime),
          messageCount: result.messageCount,
          relativePath: relativePath.replace(/\\/g, '/')
        });
        log(`Created: ${relativePath}${result.hasArtifacts ? ' (with artifacts)' : ''}`, 'success');
      }
    } catch (error) {
      errors++;
      const failTitle = conversation.title || conversation.name || 'untitled';
      log(`Error processing "${failTitle}": ${error.message}`, 'error');
    }

    processed++;
    if (typeof onProgress === 'function') {
      onProgress({
        processed,
        total,
        success,
        errors,
        skipped,
        cancelled: Boolean(cancelToken?.cancelled)
      });
    }

    // Yield to event loop so cancel / UI updates can land
    await new Promise(resolve => setImmediate(resolve));
  }

  if (options.writeIndex && indexEntries.length > 0 && !cancelToken?.cancelled) {
    indexEntries.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
    const indexMarkdown = core.buildIndexMarkdown(indexEntries, provider, {
      obsidianFrontmatter: Boolean(options.obsidianFrontmatter),
      title: options.indexTitle || 'Conversation Index'
    });
    await fs.promises.writeFile(path.join(outputDir, 'index.md'), indexMarkdown, 'utf8');
    log('Created index.md', 'success');
  }

  return {
    processed,
    total,
    success,
    errors,
    skipped,
    cancelled: Boolean(cancelToken?.cancelled),
    artifactCount: Object.keys(artifactMap).length
  };
}

module.exports = {
  EXPORT_JSON_NAMES,
  createCancelToken,
  pathExists,
  readJsonFile,
  findConversationsJson,
  buildArtifactMap,
  loadExportFromPath,
  convertConversations,
  extractZipToTemp
};
