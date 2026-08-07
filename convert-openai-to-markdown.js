#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./viewer/lib/converter-core');
const service = require('./viewer/lib/convert-service');

function printUsage() {
  console.log(`Usage: node convert-openai-to-markdown.js <input> [output-directory] [options]

Input can be:
  - a conversations.json file
  - an export folder (OpenAI / Anthropic / Gemini / Copilot)
  - a .zip export archive

Options:
  --obsidian          Add Obsidian YAML frontmatter
  --index             Write index.md
  --date-folders      Organize markdown into YYYY-MM-DD folders
  --overwrite         Overwrite existing files (default: rename)
  --skip-existing     Skip existing files
  --help              Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length < 1 ? 1 : 0);
  }

  const positional = args.filter(a => !a.startsWith('--'));
  const flags = new Set(args.filter(a => a.startsWith('--')));

  const inputPath = path.resolve(positional[0]);
  const outputDir = path.resolve(positional[1] || './markdown-output');

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input "${inputPath}" not found`);
    process.exit(1);
  }

  let AdmZip = null;
  if (inputPath.toLowerCase().endsWith('.zip')) {
    try {
      AdmZip = require(require.resolve('adm-zip', {
        paths: [path.join(__dirname, 'viewer')]
      }));
    } catch {
      console.error('ZIP support requires adm-zip. Run: cd viewer && npm install');
      process.exit(1);
    }
  }

  let loaded;
  try {
    loaded = await service.loadExportFromPath(inputPath, {
      AdmZip,
      onLog: (msg) => console.log(msg)
    });
  } catch (error) {
    console.error(`Error loading export: ${error.message}`);
    process.exit(1);
  }

  console.log(`Detected provider: ${core.providerLabel(loaded.provider)}`);
  console.log(`Conversations: ${loaded.data.length}`);

  const existingFileOption = flags.has('--overwrite')
    ? 'overwrite'
    : flags.has('--skip-existing')
      ? 'skip'
      : 'rename';

  try {
    const result = await service.convertConversations({
      conversations: loaded.data,
      provider: loaded.provider,
      outputDir,
      sourceDirectory: loaded.sourceDirectory,
      options: {
        obsidianFrontmatter: flags.has('--obsidian'),
        writeIndex: flags.has('--index'),
        dateFolders: flags.has('--date-folders'),
        existingFileOption
      },
      onLog: (message, type) => {
        const prefix = type === 'error' ? 'ERR' : type === 'success' ? 'OK ' : '   ';
        console.log(`[${prefix}] ${message}`);
      },
      onProgress: ({ processed, total }) => {
        if (processed === total || processed % 25 === 0) {
          console.log(`Progress: ${processed}/${total}`);
        }
      }
    });

    console.log(`\nDone. success=${result.success} skipped=${result.skipped} errors=${result.errors}`);
  } finally {
    if (loaded.cleanupDir) {
      fs.rmSync(loaded.cleanupDir, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
