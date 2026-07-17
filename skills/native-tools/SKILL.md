---
name: native-tools
description: >-
  HARD alias map for hstack shell-interceptor. Use after a Shell deny, or when
  picking Read/Grep/Glob/Write/Task wire names. Hooks enforce this.
---

# Native tools (shell-interceptor — HARD)

Hooks **deny** these Shell patterns. Use the native tool. Wire names differ by session — any alias works.

## Hard-denied (hooks)

| Instead of Shell | Capability | Wire names |
| ---------------- | ---------- | ---------- |
| `cat` / `head` / `tail` / `less` / `more` | `read` | `Read`, `ReadFile` |
| `grep` / `rg` / `ripgrep` / `ag` / `ack` | `grep` | `Grep`, `rg` |
| `find` / `fd` / `locate` with name/type flags | `glob` | `Glob` |
| `sed -i`, `perl -i`, `awk -i inplace` | `edit` | `StrReplace`, `ApplyPatch` |
| `echo` / `printf` / `cat <<` file redirects | `write` | `Write`, `ApplyPatch` |
| `nohup`, trailing `&`, `dev`/`start`/`watch`, non-detached compose | `hub` | `Task`, `Subagent`, `AwaitShell` |

Allowed: `echo x > /dev/null`, `git diff -w`, `docker compose up -d`, `bun test` (no `--watch`), `wc -l`, builds.

## Not hooked yet (use native; no gate yet)

| Instead of Shell | Capability | Wire names |
| ---------------- | ---------- | ---------- |
| `curl` / `wget` for docs/URLs | `web` | `WebFetch`, `WebSearch` |
| scrape/click UI | `browser` | `browser_navigate`, `browser_snapshot`, … |
| MCP discovery | `mcp` | `GetMcpTools`, `CallMcpTool` |
| delete tracked files | `delete` | `Delete` |
| `.ipynb` | `notebook` | `EditNotebook` |
| diagnostics-only | `lints` | `ReadLints` |
