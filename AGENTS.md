# AGENTS.md

## Repository

- **Path:** `C:\Users\George\Source\AIConversations`
- **Remote:** `https://github.com/George-Twiniti/AI-conversations`
- **Default branch:** `main`

## Mandatory Repo Confirmation

Before any file edits, commits, or pushes, the agent must:

1. Print current working directory (`pwd`).
2. Print git top-level path (`git rev-parse --show-toplevel`).
3. Print git remotes (`git remote -v`).
4. Print current branch (`git branch --show-current`).
5. State target repo and branch, then get explicit user confirmation.

No write operations are allowed before this confirmation.

## Project notes

- Shared conversion logic lives in `viewer/lib/` — keep CLI and Electron on the same API.
- Prefer extending `converter-core.js` / `convert-service.js` over duplicating parsers in the UI.
- Desktop UI is `viewer/app.js` + `converter.html` + `styles.css`; conversion runs in `main.js` via IPC.
- After meaningful feature work, update the root `README.md` (and `viewer/README.md` if desktop-specific).
