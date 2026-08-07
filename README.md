# AI Conversation Converter

Convert AI chat exports into clean, organized markdown — for archives, Obsidian vaults, or plain-text search.

**Supported providers:** OpenAI (ChatGPT) · Anthropic (Claude) · Google Gemini · Microsoft Copilot

Repository: [George-Twiniti/AI-conversations](https://github.com/George-Twiniti/AI-conversations)

## What it does

| Capability | Details |
| --- | --- |
| Import | Export **folder**, **`.zip`**, or raw `conversations.json` |
| Detect | Auto-detects provider from file shape |
| Select | Search + multi-select which chats to convert |
| Preview | Read markdown in-app before writing files |
| Output | Flat files, optional date folders, Obsidian frontmatter, `index.md` |
| Artifacts | Copies OpenAI `file-*` images/docs into `artifacts/` |
| Scale | Cancelable conversion for large exports |
| Surfaces | Electron desktop app **and** CLI (shared engine) |

## Quick start (desktop)

```bash
cd viewer
npm install
npm start
```

1. Select your export folder, zip, or JSON  
2. Search / select conversations (click one to preview)  
3. Toggle output options → choose an output folder  
4. **Convert Selected** (use **Cancel** if needed)  

DevTools: `npm run dev` (Windows-safe via `cross-env`).

## Quick start (CLI)

Install deps once (`cd viewer && npm install`), then from the **repo root**:

```bash
node convert-openai-to-markdown.js path/to/export ./markdown-output
node convert-openai-to-markdown.js export.zip ./out --obsidian --index --date-folders
```

| Flag | Effect |
| --- | --- |
| `--obsidian` | YAML frontmatter (`title`, `date`, `source`, `provider`, `tags`) |
| `--index` | Write `index.md` linking all converted chats |
| `--date-folders` | Place files under `YYYY-MM-DD/` |
| `--overwrite` | Replace existing files |
| `--skip-existing` | Leave existing files untouched |
| *(default)* | Rename collisions with a timestamp |

## How to export from each provider

### ChatGPT (OpenAI)
**Settings → Data controls → Export data** → download the zip when ready.  
Contains `conversations.json` plus optional `file-*` media.

### Claude (Anthropic)
**Settings → Privacy → Export data** → download the zip.  
Uses linear `chat_messages`; attachments/extracted text are usually in JSON.

### Google Gemini
Use **Google Takeout** (Gemini Apps) or a Gemini JSON dump.  
The app looks for `GeminiApps.json`, `gemini.json`, or `conversations.json`.

### Microsoft Copilot
Export chat history JSON when your account tools provide it.  
Looks for `copilot.json` or `conversations.json` with Copilot-shaped messages.

In the desktop app, open **How to export** for the same guide.

## Output layout

```
output_directory/
  ├── index.md                          # optional
  ├── 2023-04-25_Power_BI.md
  ├── 2026-02-14_Postgres_vs_MongoDB.md
  └── artifacts/
      └── 2023-04-25_Power_BI/
          └── file-abc123_chart.png
```

With date folders enabled:

```
output_directory/
  ├── index.md
  └── 2023-04-25/
      └── 2023-04-25_Power_BI.md
```

## Project layout

```
AIConversations/
  README.md                      # this file
  convert-openai-to-markdown.js  # CLI entry
  tests/                         # unit tests for the shared core
  viewer/                        # Electron app
    app.js / converter.html / styles.css
    main.js / preload.js
    lib/converter-core.js        # shared parsing + markdown
    lib/convert-service.js       # load zip/folder + batch convert
    icons/
  .github/workflows/build.yml    # tag / manual installer builds
```

## Build installers

```bash
cd viewer
npm run build:win    # NSIS
npm run build:mac    # DMG
npm run build:linux  # AppImage + deb
```

CI builds on version tags (`v1.1.0`, etc.) and via **Actions → Build & Release → Run workflow**.

## Tests

```bash
cd viewer
npm test
```

## Requirements

- Node.js **18+**
- npm

## License

MIT
