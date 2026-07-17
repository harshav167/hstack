---
name: setup-hstack
description: >-
  Install hstack from GitHub and verify shell-interceptor hooks. Use on first
  setup or when hooks are not denying shadowed Shell commands.
---

# setup-hstack

get hstack live from **GitHub** (not a local symlink). two outcomes matter: the plugin is enabled, and Shell shadows (`cat`, `rg`, …) return `permission: deny`.

## steps

### 1. add the github repo as a plugin marketplace

in cursor chat:

```text
/add-plugin https://github.com/harshav167/hstack
```

or: **Dashboard → Plugins → Team Marketplaces → Add Marketplace → Import from Repo** → `https://github.com/harshav167/hstack` (tracked branch: `main`).

the repo ships `.cursor-plugin/marketplace.json` listing the `hstack` plugin at the repo root. cursor indexes that — do **not** symlink into `~/.cursor/plugins/local/`.

### 2. enable the plugin

open **Customize → Plugins**, find **hstack**, enable it. reload window if it does not appear after import.

confirm the install is from the github cache / marketplace entry, not a hand-made local path.

### 3. optional config

if `~/.hstack/config.json` is missing, offer to create defaults:

```json
{
  "shellInterceptor": {
    "enabled": true,
    "activeCapabilities": ["read", "grep", "glob", "edit", "write", "hub"],
    "patterns": null
  }
}
```

- `enabled: false` → omp-style opt-out (allow all)
- `patterns: []` → allow all while keeping the feature installed
- never put wire names (`Read`, `rg`) in `activeCapabilities` — use capability IDs only

do not write the file unless they say yes (or already asked for defaults).

### 4. verify hooks

from a clone of the repo (or the cached install path under `~/.cursor/plugins/cache/`):

```bash
echo '{"tool_input":{"command":"cat package.json"}}' | bun src/hooks/pre-tool-use-shell.ts
echo '{"command":"echo x > /dev/null"}' | bun src/hooks/before-shell-execution.ts
```

expect: first → `"permission":"deny"` with `Read` / `ReadFile` in `agent_message`; second → `"permission":"allow"`.

then ask the user to trigger one Shell `cat` in a chat and glance at the **Hooks** output channel for the same deny JSON.

### 5. confirm soft layer

remind them: `rules/native-tools-first.mdc` is always-on; `/native-tools` is there when the agent needs the inventory. authoring later features → `/hstack-authoring`.

### 6. done

short confirmation only:

- installed via github (`harshav167/hstack`)
- interceptor enabled? (default yes)
- deny smoke passed?

if deny smoke failed: check `bun` on PATH, `CURSOR_PLUGIN_ROOT` in hooks.json, and that Auto Refresh / Refresh pulled the latest `main` commit.
