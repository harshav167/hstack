# hstack

frontier models keep shelling out — `cat`, `grep`, `rg`, `find` — until you nag them. cursor already has the right tools. the problem is the path of least resistance.

**hstack is the answer.** hard gates where soft prompts fail, plus skills and rules so the agent prefers native tools without a lecture every turn.

v1 ships one feature: an **omp-parity shell interceptor** (deny + redirect). the repo is not "bash-interceptor the plugin" — it's a **stack** you grow. next up can be TTSR (time-traveling stream rules from oh-my-pi), more gates, commands, agents, mcp — each as its own feature folder, not a bolt-on.

fork it. extend it. make it yours.

## install

```bash
/add-plugin https://github.com/harshav167/hstack
```

or clone and enable as a local plugin (Customize → Plugins), or:

```bash
ln -sfn ~/Developer/hstack ~/.cursor/plugins/local/hstack
```

## updates (how cursor picks up pushes)

cursor indexes plugins from **git commits**, not from semver alone.

| install path | how updates land |
| --- | --- |
| **team / custom marketplace** from this repo | push to the tracked branch → Auto Refresh (needs Cursor GitHub App on the repo) or dashboard **Refresh**. re-index batches ~10 min. |
| **`/add-plugin` github url** | refresh / re-import; local cache can stick — if stale, clear `~/.cursor/plugins/cache/...` or use a local symlink. |
| **local / symlink** (`~/.cursor/plugins/local/hstack`) | live files; no bump needed to see edits. |

**still bump `version` in `.cursor-plugin/plugin.json`.** it's the human + marketplace metadata. this repo uses **release-please**: conventional commits on `main` open a Release PR that bumps `package.json` + `plugin.json` together and tags `vX.Y.Z`.

commit style for auto-bump:

- `feat:` → minor (pre-1.0: still bumps usefully via release-please config)
- `fix:` → patch
- `feat!:` / `BREAKING CHANGE:` → major

## get started

two steps:

1. run [`/setup-hstack`](./skills/setup-hstack/SKILL.md) — enable the plugin, confirm hooks, optional `~/.hstack/config.json`.
2. use cursor normally. shadowed shell (`cat`, `rg`, `find -name`, …) gets **denied** with a redirect to the native tool (`Read`/`ReadFile`, `Grep`/`rg`, …).

that's it. soft guidance rides along via [`rules/native-tools-first.mdc`](./rules/native-tools-first.mdc) and [`/native-tools`](./skills/native-tools/SKILL.md).

## what's shipping (v1)

| surface | what |
| --- | --- |
| **hooks** | `preToolUse` (Shell) + `beforeShellExecution` — `permission: deny` + `failClosed` |
| **feature** | [`features/shell-interceptor/`](./features/shell-interceptor/) — omp regex parity, `cd … &&` dual-check |
| **registry** | capability IDs + wire-name aliases (`Read`/`ReadFile`, `Grep`/`rg`, `StrReplace`/`ApplyPatch`, `Task`/`Subagent`, …) — no model-family detection |
| **rule** | always-on native-tools-first |
| **skills** | `setup-hstack`, `native-tools`, `hstack-authoring` |

defaults: interceptor **on**. set `"enabled": false` in config for omp-identical opt-in behavior.

## not shipped here (yet)

reserved roots so we don't restructure later:

- **TTSR** — time-traveling stream rules (omp `TtsrManager`). kind: injector. lives in `features/ttsr/` when ported.
- **commands/** — slash commands (e.g. `hstack ttsr test`)
- **agents/** — subagent defs (pstack-style)
- **mcp/** — long-running services
- more **gates** — web/browser/mcp hard intercept (soft-only in v1)

see [`/hstack-authoring`](./skills/hstack-authoring/SKILL.md) for the add-a-feature recipe.

## skills

| skill | use it when |
| --- | --- |
| [`/setup-hstack`](./skills/setup-hstack/SKILL.md) | first install, or hooks aren't firing |
| [`/native-tools`](./skills/native-tools/SKILL.md) | agent should prefer Read/Grep/Glob/… over Shell |
| [`/hstack-authoring`](./skills/hstack-authoring/SKILL.md) | adding TTSR or any new feature folder |

## config

optional: `~/.hstack/config.json`

```json
{
  "shellInterceptor": {
    "enabled": true,
    "activeCapabilities": ["read", "grep", "glob", "edit", "write", "hub"],
    "patterns": null
  }
}
```

| field | meaning |
| --- | --- |
| `enabled` | default **true** |
| `activeCapabilities` | stable IDs — not wire names |
| `patterns` | `null` = defaults; `[]` = allow all; non-empty = replace |

sibling keys (e.g. `ttsr`) land later without nesting under `shellInterceptor`.

## smoke

after setup:

1. `cat package.json` → deny → `Read` / `ReadFile`
2. `rg pattern` → deny → `Grep` / `rg`
3. `echo x > /dev/null` → allow
4. `cd dir && cat file` → deny (dual-check)
5. Hooks channel shows valid JSON

## develop

```bash
cd ~/Developer/hstack
bun install
bun test
```

layout:

```
features/<name>/     # one product feature per folder
src/shared/          # hook-io, config, capability registry
src/hooks/           # thin cursor entrypoints
hooks/ hooks.json
rules/ skills/ commands/ agents/ mcp/
```

## license

MIT
