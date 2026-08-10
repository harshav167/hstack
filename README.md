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

## OMP marketplace install

```bash
# once
omp plugin marketplace add /Users/harsha/Developer/hstack
# or after push:
# omp plugin marketplace add harshav167/hstack

omp plugin discover hstack
omp plugin install pstack@hstack
omp plugin install thermos@hstack
omp plugin install cursed-plugins@hstack
omp plugin install codex-security@hstack

# project-only
omp plugin install --scope project pstack@hstack
```

Then `/reload-plugins` (or restart) so skills/agents/commands refresh.

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

Converter: `../plugins/scripts/cursor-plugin-to-omp.mjs`

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
