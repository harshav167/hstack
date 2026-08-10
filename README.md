# hstack

Two things live in this repo on purpose:

1. **Cursor core plugin** (repo root) — shell interceptor, LSP diagnostics-on-write, hstack-mode. Cursor-only architecture. Leave it alone.
2. **OMP marketplace** (`plugins/` + `.omp-plugin/marketplace.json`) — normalized OMP packages you can install pick-and-choose via `omp plugin marketplace`.

Ansel-style “one marketplace, many plugins” without hacking root hstack into OMP.

## Cursor install (core hstack only)

```text
/add-plugin https://github.com/harshav167/hstack
```

or **Dashboard → Plugins → Add Marketplace → Import from Repo** → `https://github.com/harshav167/hstack` (branch `main`), enable **hstack**.

Layout: `.cursor-plugin/marketplace.json` + `.cursor-plugin/plugin.json` (source `.`).

## OMP install (important)

OMP still discovers **marketplace** plugin skills via the `claude-plugins` provider.
If you disable `claude-plugins` (to avoid importing `~/.claude` junk), marketplace
skills will not load even when `omp plugin list` shows them installed.

**Working path today:** build packages into `plugins/`, then **native-link** them
so they load through `omp-plugins` (OMP Extension Packages), with Claude providers off.

```bash
# rebuild OMP packages from upstream sources
bun scripts/build-omp-marketplace.mjs --clean

# native link (skills load with claude-plugins disabled)
omp plugin install -l ./plugins/pstack
omp plugin install -l ./plugins/thermos
omp plugin install -l ./plugins/cursed-plugins
omp plugin install -l ./plugins/codex-security

# reload / new session
```

Marketplace catalog still exists for discovery/publish:

```bash
omp plugin marketplace add harshav167/hstack   # or local path
omp plugin discover hstack
# install name@hstack only works for skills if claude-plugins is enabled
```

Keep `disabledProviders: [claude, claude-plugins, ...]` if you do not want Claude
registry imports. Prefer `-l` links until OMP splits marketplace discovery from Claude.

### Catalog (OMP)

| Plugin | What |
| --- | --- |
| **pstack** | workflows, poteto-mode, agents, `/setup-pstack` → `~/.omp/agent/pstack.yaml` |
| **thermos** | thermo-nuclear review skills + agents |
| **cursed-plugins** | roast/blame/therapy/… skills |
| **codex-security** | OpenAI Codex Security skill pack (OMP package) |

Root **hstack** is **not** in the OMP catalog (Cursor-only).

## Layout

```text
hstack/
├── .cursor-plugin/          # Cursor marketplace (hstack core only)
│   ├── marketplace.json
│   └── plugin.json
├── .omp-plugin/             # OMP marketplace catalog
│   └── marketplace.json
├── plugins/                 # built OMP packages (generated)
│   ├── pstack/
│   ├── thermos/
│   ├── cursed-plugins/
│   └── codex-security/
├── scripts/
│   ├── build-omp-marketplace.mjs
│   └── release-on-main.ts
├── features/ …              # Cursor hstack features (unchanged)
├── skills/ agents/ hooks/   # Cursor hstack surfaces
└── README.md
```

## Rebuild OMP packages

Sources are read from sibling checkouts (not mutated):

- `../plugins/cursor-plugins/pstack`
- `../plugins/cursor-plugins/thermos`
- `../plugins/cursed-plugins`
- `/tmp/openai-plugins-src/plugins/codex-security` (cloned on demand)

Converter: `scripts/cursor-plugin-to-omp.mjs`

```bash
bun scripts/build-omp-marketplace.mjs --clean
```

Commit the regenerated `plugins/` + `.omp-plugin/marketplace.json` when you want the remote marketplace updated.

## pstack setup on OMP

After installing `pstack@hstack`:

```text
/setup-pstack
```

Writes **`~/.omp/agent/pstack.yaml`** (workflow role → model).  
Named agents (`poteto-agent`, `comment-sicko`) still use OMP `/agents` → `task.agentModelOverrides` in `~/.omp/agent/config.yml`.

## Updates

| path | updates |
| --- | --- |
| Cursor core | push to `main` (existing release workflow) |
| OMP packages | rebuild script → commit `plugins/` → push → `omp plugin marketplace update hstack` → `omp plugin upgrade …@hstack` |

## License

MIT for hstack core. Individual marketplace plugins keep upstream licenses (see each `plugins/*/package.json`).
