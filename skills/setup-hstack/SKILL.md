---
name: setup-hstack
description: >-
  Install and verify the hstack Cursor plugin: enable local plugin, confirm
  shell-interceptor hooks, optional ~/.hstack/config.json. Use on first setup
  or when hooks are not denying shadowed Shell commands.
---

# setup-hstack

get hstack live in this cursor install. two outcomes matter: the plugin is enabled, and Shell shadows (`cat`, `rg`, …) return `permission: deny`.

## steps

### 1. locate the plugin root

prefer the repo the user cares about (often `~/Developer/hstack` or a clone of `https://github.com/harshav167/hstack`). if unsure, ask once.

install options:

```bash
/add-plugin https://github.com/harshav167/hstack
```

or local symlink:

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /absolute/path/to/hstack ~/.cursor/plugins/local/hstack
```

do not invent a second copy under `~/.cursor/plugins/local/` unless they want a symlink.
### 2. enable in cursor

**fastest (local):** ensure symlink exists (create-plugin-scaffold default):

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /absolute/path/to/hstack ~/.cursor/plugins/local/hstack
```

then **reload window** (Cmd+Shift+P → "Developer: Reload Window") or restart cursor. hstack should appear under **Customize → Plugins** as a local plugin.

confirm `.cursor-plugin/plugin.json` exists and only declares paths that have real files (`hooks`, `rules`, `skills`). do **not** point `mcpServers`/`commands`/`agents` at empty dirs — that makes cursor reject the plugin.

github `/add-plugin` only works reliably for marketplace / team-marketplace imports, not arbitrary private-dev repos. local symlink is the supported personal path.
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

run a real deny/allow check from the plugin root (not a source-grep):

```bash
cd /path/to/hstack
echo '{"tool_input":{"command":"cat package.json"}}' | bun src/hooks/pre-tool-use-shell.ts
echo '{"command":"echo x > /dev/null"}' | bun src/hooks/before-shell-execution.ts
```

expect: first → `"permission":"deny"` with `Read` / `ReadFile` in `agent_message`; second → `"permission":"allow"`.

then ask the user to trigger one Shell `cat` in a chat and glance at the **Hooks** output channel for the same deny JSON.

### 5. confirm soft layer

remind them: `rules/native-tools-first.mdc` is always-on; `/native-tools` is there when the agent needs the inventory. authoring later features → `/hstack-authoring`.

### 6. done

short confirmation only:

- plugin path
- interceptor enabled? (default yes)
- deny smoke passed?

if deny smoke failed: check `bun` on PATH, `CURSOR_PLUGIN_ROOT` in hooks.json, and that the enabled plugin path is this repo (not a stale copy).
