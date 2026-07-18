# hstack

a cursor plugin you grow. features live in folders. hooks, rules, skills, agents, commands, mcp — pick what each feature needs.

first two features ship now: a **shell interceptor** (omp-parity hard-deny of Shell shadows) and **lsp diagnostics-on-write** (omp writethrough + droid-lsp daemon lifecycle). more features come later (TTSR from oh-my-pi, and whatever else belongs here). no feature is the product name.

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
| **features/lsp/** | diagnostics-on-write daemon + hooks: fresh LSP diagnostics injected after Write/StrReplace/Edit, store peek after Read, late results on `stop` |
| **hooks** | `preToolUse` (Shell) + `beforeShellExecution` — `failClosed` deny |
| **registry** | capability IDs + wire-name aliases (no model-family detection) |
| **rule** | `native-tools-first` — always-on **HARD** rule; hooks enforce it |
| **skills** | setup, authoring, native-tools inventory, **hstack-mode** (`mode: true`) |
| **agents** | `hstack-agent` |

reserved empty dirs (`commands/`, `mcp/`) stay undeclared in `plugin.json` until they have real files.

## lsp diagnostics

one daemon per user (`~/.hstack/run/lspd.sock` + pid lockfile — a second spawn forwards and exits, so no daemon sprawl). it lazily spawns language servers per `server:project-root`, restarts them with a backoff budget, and holds a central diagnostics store. hooks are thin clients; all LSP state lives in the daemon.

| hook | job |
| --- | --- |
| `sessionStart` | attach the conversation to the daemon |
| `postToolUse` (Write/StrReplace/Edit/ApplyPatch) | fresh diagnostics within an inline budget (default 800ms), else `{pending}` |
| `postToolUse` (Read) | peek the store — known errors before the agent plans edits |
| `stop` | drain late results as `followup_message` |
| `sessionEnd` | release the conversation's ledger + pending entries |

server table is omp's `lsp.json` shape. sources, lowest to highest: bundled `features/lsp/servers.json` → `~/.hstack/lsp.json` → project-root `lsp.json`. override by name, `disabled` filters, deep-merged `initOptions`/`settings`. bundled default is the user's curated set (typescript-7, oxc, oxfmt, gopls, golangci-lint, vscode html/css/json, ty, ruff, semgrep, snyk); semgrep/snyk are flagged `defer` so slow security scans land on the stop hook, never in the inline window.

### snyk auth

the bundled snyk entry reads credentials from the snyk CLI config. when those lapse, the language server falls back to an OAuth browser flow on spawn. bypass it with an API token:

```json
// ~/.hstack/lsp.json
{
  "servers": {
    "snyk": { "initOptions": { "token": "<api token from app.snyk.io>" } }
  }
}
```

deep-merge keeps the bundled activation flags; only `token` is added. or disable it entirely with `{ "snyk": { "disabled": true } }`.

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
  },
  "lsp": {
    "enabled": true,
    "inlineTimeoutMs": 800,
    "idleTimeoutMs": 1800000
  }
}
```

`patterns: null` = defaults; `[]` = allow all (turns the gate off). future keys (e.g. `ttsr`) sit beside `shellInterceptor`, not under it. `lsp.inlineTimeoutMs` is the per-write inline budget before slow servers move to the stop-hook channel; `lsp.idleTimeoutMs` is the daemon's global idle shutdown (default 30 min). per-root `lsp.json` `idleTimeoutMs` is parsed for omp compatibility but the daemon reads only the hstack config key.

the lsp feature is **opt-in** (`lsp.enabled` defaults false — it spawns language servers). set `"lsp": { "enabled": true }` to turn it on. the shell interceptor is **default on** (`enabled` defaults true).

## smoke (shell-interceptor)

1. `cat package.json` → **deny** → Read / ReadFile
2. `rg pattern` → **deny** → Grep / rg
3. `echo x > /dev/null` → allow
4. `cd dir && cat file` → **deny**
5. Hooks channel shows `permission: "deny"` / `"allow"`

## smoke (lsp diagnostics)

1. in a scratch workspace, Write a file with a type error (e.g. `const x: number = "s"` in a `.ts`) → tool result carries `additional_context` with the diagnostic
2. Read the same file again → known errors come back from the store without a wait
3. Write a file a slow server handles (semgrep/snyk set) → result returns promptly; late findings arrive on the next `stop` as a follow-up notice
4. `lsof -U | grep lspd` shows one socket; `ps aux | grep daemon-entry` shows one daemon
5. Hooks channel shows `additional_context` payloads; daemon log is `~/.hstack/logs/lspd.log`

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

`features/lsp/` layout: `servers.json` (bundled table), `config.ts` (discovery + merge), `client.ts` (stdio LSP), `wait.ts` (freshness), `ledger.ts` (dedup), `format.ts`, `store.ts`, `router.ts`, `supervisor.ts`, `policy.ts`, `daemon.ts` (single instance + lifecycle), `protocol.ts` (wire ops), `hook-client.ts` (hook-side daemon client). daemon entry is `daemon-entry.ts`, spawned detached on a cold socket.

## license

MIT
