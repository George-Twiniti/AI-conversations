# AI Conversation Converter

A standalone desktop application to convert **OpenAI (ChatGPT)** and **Anthropic (Claude)** conversation exports into organized markdown files.

## Features

- 🖥️ **Standalone Desktop App** - Built with Electron, runs on Windows, macOS, and Linux
- 🔄 **Auto-detect provider** - Sniffs `mapping` (OpenAI) vs `chat_messages` (Anthropic)
- 📄 **Full OpenAI Export Support** - Handles JSON plus images, documents, and artifacts
- 🟣 **Anthropic / Claude Support** - Linear `chat_messages`, ISO timestamps, inline artifacts
- 🖼️ **Image Embedding** - Automatically embeds OpenAI images in markdown files
- 📎 **Document Linking** - Links attachments; Anthropic extracted text is inlined
- 📁 **Organized Output** - Flat markdown files with a shared artifacts folder
- 📊 **Progress Tracking** - Real-time progress bar and conversion logs

## Installation

1. Navigate to the `viewer` directory:
   ```bash
   cd viewer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development Mode

```bash
npm start
```

Or with DevTools open:

```bash
npm run dev
```

### Building for Distribution

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

Built applications will be in the `dist` directory.

## How to Use

### Full Export Mode (Recommended)

1. **Launch the application** using `npm start`
2. **Click "Select Source Folder"** and choose your export folder (contains `conversations.json`)
3. The app detects OpenAI vs Anthropic automatically and shows the provider in the file info panel
4. **Click "Choose Output Directory"**
5. **Click "Convert to Markdown"**
6. **Monitor progress** in the log panel

### Legacy Mode (JSON Only)

1. **Click "Select JSON File Only"** if you only have `conversations.json`
2. Follow the output/convert steps above (OpenAI local artifacts will not be included)

### CLI

From the repo root:

```bash
node convert-openai-to-markdown.js path/to/conversations.json ./markdown-output
```

## Provider differences

| Concern | OpenAI | Anthropic |
| --- | --- | --- |
| Message structure | `mapping` DAG | Linear `chat_messages` |
| Title field | `title` | `name` |
| Timestamps | Unix seconds (`create_time`) | ISO-8601 (`created_at`) |
| Sender / role | `author.role` (`user` / `assistant`) | `sender` (`human` / `assistant`) |
| Artifacts | Local `file-*` files copied into `artifacts/` | Inline text / `<antArtifact>` blocks / extracted attachment text |

## Output Format

```
output_directory/
  ├── 2023-04-25_Power_BI.md
  ├── 2026-02-14_Postgres_vs_MongoDB.md
  └── artifacts/
      └── 2023-04-25_Power_BI/
          └── file-abc123_chart.png
```

## Requirements

- Node.js (v14 or higher)
- npm or yarn

## License

MIT
