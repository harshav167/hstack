# hstack

frontier models keep shelling out — `cat`, `grep`, `rg`, `find` — until you nag them. cursor already has the right tools. the problem is the path of least resistance.

**hstack is the answer.** hard gates where soft prompts fail, plus skills and rules so the agent prefers native tools without a lecture every turn.

v1 ships one feature: an **omp-parity shell interceptor** (deny + redirect). the repo is not "bash-interceptor the plugin" — it's a **stack** you grow. next up can be TTSR (time-traveling stream rules from oh-my-pi), more gates, commands, agents, mcp — each as its own feature folder, not a bolt-on.

fork it. extend it. make it yours.

## install

add from github (no local symlink):

```text
/add-plugin https://github.com/harshav167/hstack
```

or **Dashboard → Plugins → Add Marketplace → Import from Repo** → `https://github.com/harshav167/hstack` (branch `main`), then enable **hstack** under Customize → Plugins.

the repo is a single-plugin marketplace: `.cursor-plugin/marketplace.json` + `.cursor-plugin/plugin.json`.

## updates (how cursor picks up pushes)

cursor indexes plugins from **git commits**, not from semver alone.

| install path | how updates land |
| --- | --- |
| **team / custom marketplace** from this repo | push to `main` → Auto Refresh (Cursor GitHub App on the repo) or dashboard **Refresh**. re-index batches ~10 min. |
| **`/add-plugin` github url** | refresh / re-import the marketplace; clear stale cache under `~/.cursor/plugins/cache/` if the UI sticks. |

**still bump `version` in `.cursor-plugin/plugin.json`.** it's the human + marketplace metadata. this repo uses **release-please**: conventional commits on `main` open a Release PR that bumps `package.json` + `plugin.json` together and tags `vX.Y.Z`.

commit style for auto-bump:

- `feat:` → minor (pre-1.0: still bumps usefully via release-please config)
- `fix:` → patch
- `feat!:` / `BREAKING CHANGE:` → major

## get started

two steps:

1. install from github (`/add-plugin https://github.com/harshav167/hstack`), enable **hstack**.
2. optional: pick **Hstack Mode** in the mode dropdown (Custom Modes / beta) — same pattern as pstack's Poteto Mode — or run `/hstack-mode`.

shadowed shell (`cat`, `rg`, `find -name`, …) gets **denied** with a redirect either way (hooks). the mode makes the preference sticky in the picker.

soft guidance also rides along via [`rules/native-tools-first.mdc`](./rules/native-tools-first.mdc) and [`/native-tools`](./skills/native-tools/SKILL.md).

## what's shipping (v1)

| surface | what |
| --- | --- |
| **hooks** | `preToolUse` (Shell) + `beforeShellExecution` — `permission: deny` + `failClosed` |
| **feature** | [`features/shell-interceptor/`](./features/shell-interceptor/) — omp regex parity, `cd … &&` dual-check |
| **registry** | capability IDs + wire-name aliases (`Read`/`ReadFile`, `Grep`/`rg`, `StrReplace`/`ApplyPatch`, `Task`/`Subagent`, …) — no model-family detection |
| **rule** | always-on native-tools-first |
| **skills** | `setup-hstack`, `native-tools`, `hstack-authoring`, **`hstack-mode`** (`mode: true` → Custom Modes picker) |
| **agents** | `hstack-agent` — subagent routing for hstack-mode |

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
| [`/setup-hstack`](./skills/setup-hstack/SKILL.md) | first install from github, or hooks aren't firing |
| [`/hstack-mode`](./skills/hstack-mode/SKILL.md) | sticky native-tools-first mode (shows under Custom Modes when `mode: true`) |
| [`/native-tools`](./skills/native-tools/SKILL.md) | agent should prefer Read/Grep/Glob/… over Shell |
| [`/hstack-authoring`](./skills/hstack-authoring/SKILL.md) | adding TTSR or any new feature folder |

### custom mode vs skill vs hooks

| layer | what it is | pstack equivalent |
| --- | --- | --- |
| **Custom Mode** (beta picker) | a skill with `mode: true` (+ `icon` / `color`) in frontmatter | `skills/poteto-mode` → **Poteto Mode** |
| **skill** (`/name`) | invokable guidance; optional `disable-model-invocation` | `/how`, `/interrogate`, … |
| **agent** | `agents/*.md` — `subagent_type` target | `agents/poteto-agent.md` |
| **hooks** | hard deny / observe — not a mode | (pstack doesn't ship shell gates) |

hstack's hard enforcement is **hooks**. **Hstack Mode** is the sticky soft posture in the mode dropdown — same shipping trick as pstack, different job.
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
rules/ skills/
# reserved (not declared in plugin.json until they have real files):
# agents/ commands/ mcp/
```

**plugin.json rule:** do not declare empty `mcpServers`/`commands`/`agents` paths — cursor rejects the plugin. rely on folder discovery (or declare paths only after real files exist). github install needs `.cursor-plugin/marketplace.json` listing the plugin for `/add-plugin` and Import from Repo.
## license

MIT
