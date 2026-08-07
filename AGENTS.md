# AGENTS.md

## Mandatory Repo Confirmation

Before any file edits, commits, or pushes, Codex must:

1. Print current working directory (`pwd`).
2. Print git top-level path (`git rev-parse --show-toplevel`).
3. Print git remotes (`git remote -v`).
4. Print current branch (`git branch --show-current`).
5. State target repo and branch, then get explicit user confirmation.

No write operations are allowed before this confirmation.

## Scope

These instructions apply to the Praxis repository at this path:

`C:\Users\George\Source\Praxis`
