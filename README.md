# hstack

a cursor plugin you grow. features live in folders. hooks, rules, skills, agents, commands, mcp — pick what each feature needs.

the first feature is a **shell interceptor** (omp-parity): **hard-deny** Shell when it shadows native tools. more features come later (TTSR from oh-my-pi, and whatever else belongs here). the interceptor is one feature, not the product name.

fork it. extend it.

## install

```text
/add-plugin https://github.com/harshav167/hstack
```

or **Dashboard → Plugins → Add Marketplace → Import from Repo** → `https://github.com/harshav167/hstack` (branch `main`), then enable **hstack**.

layout for github import: `.cursor-plugin/marketplace.json` + `.cursor-plugin/plugin.json`.

## updates

cursor re-indexes from **git pushes** (commit SHA). bump `version` in `plugin.json` anyway — humans and marketplace metadata care.

| path | updates |
| --- | --- |
| team / custom marketplace | push to `main` → Auto Refresh (Cursor GitHub App) or dashboard Refresh |
| `/add-plugin` | refresh / re-import; clear `~/.cursor/plugins/cache/` if stuck |

**release** runs on every push to `main`. If there are conventional `feat:` / `fix:` / breaking commits since the last `v*` tag, it bumps `package.json` + both `.cursor-plugin/*.json`, tags, and creates a GitHub Release — **no Release PR**, so you do not need “Allow GitHub Actions to create pull requests”.

## get started

1. install from github, enable **hstack**
2. optional: pick **Hstack Mode** in the mode dropdown, or `/hstack-mode`
3. optional: `/setup-hstack` to verify hooks + config

shell-interceptor is **on by default**. shadowed Shell is **denied** by hooks (`permission: "deny"`).

## what's in the repo

| surface | what |
| --- | --- |
| **features/shell-interceptor/** | **hard gate**: deny Shell shadows of read/grep/glob/edit/write/hub |
| **hooks** | `preToolUse` (Shell) + `beforeShellExecution` — `failClosed` deny |
| **registry** | capability IDs + wire-name aliases (no model-family detection) |
| **rule** | `native-tools-first` — always-on **HARD** rule; hooks enforce it |
| **skills** | setup, authoring, native-tools inventory, **hstack-mode** (`mode: true`) |
| **agents** | `hstack-agent` |

reserved empty dirs (`commands/`, `mcp/`) stay undeclared in `plugin.json` until they have real files.

## skills

| skill | when |
| --- | --- |
| [`/setup-hstack`](./skills/setup-hstack/SKILL.md) | github install / hook smoke |
| [`/hstack-mode`](./skills/hstack-mode/SKILL.md) | sticky mode in the picker |
| [`/native-tools`](./skills/native-tools/SKILL.md) | alias inventory for the interceptor feature |
| [`/hstack-authoring`](./skills/hstack-authoring/SKILL.md) | add the next feature |

### mode vs skill vs hooks

| layer | job |
| --- | --- |
| **hooks** | **hard deny** — why this feature exists |
| **rule** | always-on HARD instruction (same policy; hooks make it stick) |
| **Custom Mode** | skill with `mode: true` (+ `icon` / `color`) — same as pstack Poteto Mode |
| **skill** | `/name` inventory / authoring |
| **agent** | `subagent_type` target |

## config

`~/.hstack/config.json` — sibling keys per feature:

```json
{
  "shellInterceptor": {
    "enabled": true,
    "activeCapabilities": ["read", "grep", "glob", "edit", "write", "hub"],
    "patterns": null
  }
}
```

`patterns: null` = defaults; `[]` = allow all (turns the gate off). future keys (e.g. `ttsr`) sit beside `shellInterceptor`, not under it.

## smoke (shell-interceptor)

1. `cat package.json` → **deny** → Read / ReadFile
2. `rg pattern` → **deny** → Grep / rg
3. `echo x > /dev/null` → allow
4. `cd dir && cat file` → **deny**
5. Hooks channel shows `permission: "deny"` / `"allow"`

## develop

```bash
cd ~/Developer/hstack
bun install
bun test
```

```
features/<name>/     # one feature per folder
src/shared/          # hook-io, config, registry
src/hooks/           # thin entrypoints
hooks/ rules/ skills/ agents/
```

don't declare empty `mcpServers` / `commands` / `agents` paths in `plugin.json` — cursor rejects the plugin.

## license

MIT
