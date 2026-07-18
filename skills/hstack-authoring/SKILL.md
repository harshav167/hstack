---
name: hstack-authoring
description: >-
  Add a new hstack feature (gate, injector, command, agent, MCP). Use when
  extending the plugin — TTSR, new hooks, sibling config keys.
---

# adding a feature

new work = new `features/<name>/` + wiring. don't edit an unrelated feature to bolt something on.

## kinds

| kind | job | surfaces |
| ---- | --- | -------- |
| **gate** | block before run | `preToolUse`, `beforeShellExecution` → deny |
| **injector** | react / inject | `afterAgentThought`, `postToolUse`, `stop` |
| **command** | slash command | `commands/*.md` |
| **agent** | subagent | `agents/*.md` |
| **rule** / **skill** | always-on HARD instruction / inventory (gates still need hooks) | `rules/*.mdc`, `skills/*/SKILL.md` |
| **mcp** | service | `mcp.json` (root) — not an empty `mcp/` path in the manifest |

example next feature: **TTSR** (time-traveling stream rules from oh-my-pi) → `features/ttsr/`, kind injector.

## recipe

1. `features/<name>/` + `test/features/<name>.test.ts`
2. sibling key in `src/shared/config/schema.ts`
3. wire only what you need (hooks / commands / agents / skills / mcp.json)
4. declare paths in `plugin.json` only after real files exist
5. one line in the README under what's shipping — keep the stack framing

shared: `hook-io.ts`, `config/load.ts`. types stay inside the feature.

## features shipping today

- `features/shell-interceptor/` — gate (hard deny)
- `features/lsp/` — injector (diagnostics-on-write). proves the daemon pattern: hooks are ephemeral, so long-lived state (LSP clients, stores, ledgers) lives in a single daemon per user behind a unix socket; hooks are thin clients. copy that shape for any feature needing persistent state (TTSR stream state, watchers, indexers).

## TTSR notes

reuse omp `TtsrManager` matcher/tests. map to cursor event-boundary hooks. mid-stream abort is a platform gap — document partial parity. config: `{ "ttsr": { "enabled": false, ... } }`.
