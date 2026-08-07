# AI Conversation Converter (desktop)

Electron UI for the shared conversion engine. For the full project overview, see the [root README](../README.md).

## Features

- Standalone desktop app (Windows, macOS, Linux)
- Import **folder**, **`.zip`**, or JSON
- Auto-detect **OpenAI / Anthropic / Gemini / Copilot**
- Searchable conversation picker with multi-select
- In-app markdown **preview**
- Options: Obsidian frontmatter, `index.md`, date folders, collide handling
- OpenAI `file-*` artifact copy into `artifacts/`
- Cancelable conversion + live log/progress
- Built-in **How to export** dialog

## Install & run

```bash
cd viewer
npm install
npm start
```

| Script | Purpose |
| --- | --- |
| `npm start` | Run the app |
| `npm run dev` | Run with DevTools (`cross-env` works on Windows) |
| `npm test` | Shared-core unit tests |
| `npm run build:win` / `build:mac` / `build:linux` | Platform installers → `dist/` |

## Typical workflow

1. **Select Folder** or **Select File / ZIP** (drag-and-drop also works)
2. Search and check the chats you want
3. Click a row to **preview** markdown
4. Set output options → **Choose Output Folder**
5. **Convert Selected** — use **Cancel** to stop mid-run

## CLI (same engine)

From the repo root after `npm install` in `viewer/`:

```bash
node convert-openai-to-markdown.js path/to/export ./markdown-output --obsidian --index
```

See the [root README](../README.md) for all flags and export instructions.

## Architecture

| Module | Role |
| --- | --- |
| `lib/converter-core.js` | Provider detect, message extract, markdown + frontmatter |
| `lib/convert-service.js` | Find JSON in trees/zips, artifact map, batch convert + cancel |
| `main.js` | Electron main process; holds loaded session; runs convert off the UI thread |
| `preload.js` | Safe IPC bridge (`contextIsolation`) |
| `app.js` + `converter.html` + `styles.css` | Renderer UI |

Conversion never re-implements parsing in the renderer — the UI only sends indexes and options over IPC.

## Requirements

- Node.js 18+
- npm

## License

MIT
