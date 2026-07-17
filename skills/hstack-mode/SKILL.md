---
name: Hstack Mode
description: >-
  Work in the hstack plugin style: feature folders, sibling config, hard hooks
  for gates. Use for hstack, /hstack-mode, or extending the plugin.
disable-model-invocation: true
mode: true
icon: shield
color: blue
reminder: New feature? New features/<name>/ folder. Don't bolt onto an existing feature.
---

# Hstack mode

Sticky posture for working **on or with** the hstack plugin.

## Non-negotiables

1. **Feature folders.** One product feature per `features/<name>/`. Zero cross-feature imports.
2. **Sibling config.** New knobs go next to existing keys in `~/.hstack/config.json` — never nested under another feature.
3. **Declare only real surfaces.** Don't list empty `mcpServers` / `commands` / `agents` paths in `plugin.json`.
4. **Shared runtime stays thin.** `hook-io`, `config/load` — no feature logic in `src/shared/`.
5. **Authoring recipe.** `/hstack-authoring` for gate / injector / command / agent / mcp.

## Shell interceptor (one feature — HARD)

When enabled, **must** use native tools for read/search/glob/edit/write/long-running jobs. Hooks **deny** shadowed Shell (`permission: "deny"`). If denied, follow the redirect; do not retry the same shell. Inventory: `/native-tools`.

Shell stays allowed for `wc`, `diff`, `git`, builds/tests, and real process control.

## Subagents

Use `subagent_type: "hstack-agent"` when the delegate must keep this posture.

## Opt out

Switch the mode picker away, or say so. Set `shellInterceptor.enabled: false` to turn the hard gate off in config.
