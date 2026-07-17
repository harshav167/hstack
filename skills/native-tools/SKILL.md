---
name: native-tools
description: >-
  Prefer Cursor native tools over Shell. Use when the agent reaches for cat, grep,
  rg, find, sed, echo redirects, curl, or long-running shell jobs; when asked to
  use Grep/rg not shell grep, Read/ReadFile not cat, or stop shelling out.
---

# Native tools (hstack)

Use dedicated Cursor tools. Wire names differ by session — pick any alias listed.

## Hard-intercepted (hstack blocks Shell shadows)

| Instead of Shell | Capability | Wire names |
| ---------------- | ---------- | ---------- |
| `cat` / `head` / `tail` / `less` / `more` | `read` | `Read`, `ReadFile` |
| `grep` / `rg` / `ripgrep` / `ag` / `ack` | `grep` | `Grep`, `rg` |
| `find` / `fd` / `locate` with name/type flags | `glob` | `Glob` |
| `sed -i`, `perl -i`, `awk -i inplace` | `edit` | `StrReplace`, `ApplyPatch` |
| `echo` / `printf` / `cat <<` file redirects | `write` | `Write`, `ApplyPatch` |
| `nohup`, trailing `&`, `dev`/`start`/`watch`, non-detached compose | `hub` | `Task`, `Subagent`, `AwaitShell` |

Allowed Shell examples: `echo x > /dev/null`, `git diff -w`, `docker compose up -d`, `bun test` (no `--watch`), `wc -l`, builds.

## Soft guidance (not blocked in v1)

| Instead of Shell | Capability | Wire names |
| ---------------- | ---------- | ---------- |
| `curl` / `wget` for docs/URLs | `web` | `WebFetch`, `WebSearch` |
| scrape/click UI | `browser` | `browser_navigate`, `browser_snapshot`, … |
| MCP/API discovery | `mcp` | `GetMcpTools`, `CallMcpTool` |
| delete tracked files | `delete` | `Delete` |
| `.ipynb` edits | `notebook` | `EditNotebook` |
| diagnostics-only | `lints` | `ReadLints` |

## Native MCP servers

- `cursor-ide-browser` — `browser_*` tools
- `cursor-app-control` — workspace/chat automation
- `fsd` — PR self-driving

## When Shell is correct

Computing facts, package managers, git porcelain that needs the real CLI, process control that has no native equivalent.
