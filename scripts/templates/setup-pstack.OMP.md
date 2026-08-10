---
name: setup-pstack
description: "Configure pstack workflow-role models for OMP. Detects models via `omp models` and writes ~/.omp/agent/pstack.yaml. Use for /setup-pstack or changing pstack model choices. Not for /agents type overrides."
---

# Setup pstack (OMP)

Write `~/.omp/agent/pstack.yaml`: workflow-role → model overrides for pstack skills.
Skills read this file and fall back to their inline defaults when a key is missing.

## What this is / is not

| Surface | Path | Purpose |
|---|---|---|
| **This skill** | `~/.omp/agent/pstack.yaml` | how/arena/swarm/interrogate/… **workflow roles** |
| OMP `/agents` | `~/.omp/agent/config.yml` → `task.agentModelOverrides` | named agent **types** (`poteto-agent`, `comment-sicko`, bundled agents) |

Do **not** write Cursor rules, `.mdc` files, or anything under `~/.cursor/`.
Do **not** put agent-type overrides into pstack.yaml.

## Steps

### 1. Detect available models (OMP)

Run:

```bash
omp models
```

Collect the model ids / `provider/id` strings the user can actually select.
Optional: `omp models find <substr>` to narrow.

Always-valid aliases even if not listed:

- `inherit-parent`
- `auto`

Both mean: this role rides the **parent chat model** (omit an explicit Task `model`).

Never write a real slug that did not appear in detection (or that the user did not explicitly confirm).

### 2. Load current state

If `~/.omp/agent/pstack.yaml` exists, read it (YAML). Treat its keys as current choices.
Otherwise start from the defaults in step 5.

Named agents shipped by this package can be tuned later in OMP's `/agents` UI
(`task.agentModelOverrides`). Leave those alone here.

### 3. Map and confirm (OMP UX)

Present every role with its current value. Mark any real slug missing from the detected set.

Use OMP's structured `ask` tool (multi-select / per-role choices) — **not** Cursor `AskQuestion`.
Offer detected models plus `inherit-parent` and `auto`.

Panel roles are **lists** (one subagent per entry; list length = fan-out):

- `how critics`
- `arena runners`
- `architect runners`
- `interrogate reviewers`
- `arena cross-judge pool` (list of candidates; Arena picks one, prefer a different family from parent)

Scalar roles are single strings (`swarm workers`, `bug-fix`, …).

### 4. Validate

For every real slug: must be in the detected set.
`inherit-parent` / `auto` always pass.
If invalid, stop and re-ask — do not write a broken file.

### 5. Write the config

```bash
mkdir -p ~/.omp/agent
```

Overwrite `~/.omp/agent/pstack.yaml` entirely (idempotent re-runs). Use quoted keys where labels contain commas/spaces. Lists are YAML arrays.

```yaml
# pstack workflow-role models (OMP). Delete a key to use the skill default.
# inherit-parent / auto => parent chat model (omit Task model).
"feature, refactoring": grok-4.5-fast-xhigh
bug-fix: gpt-5.6-sol-max
perf-issue: gpt-5.6-sol-max
hillclimb: gpt-5.6-sol-max
"judgment and prose": claude-fable-5-thinking-max
"hardest tasks": claude-fable-5-thinking-max
"how explorer": grok-4.5-fast-xhigh
"how explainer": claude-fable-5-thinking-max
"how critics":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"why investigators": grok-4.5-fast-xhigh
"why synthesizer": claude-fable-5-thinking-max
"reflect tooling": gpt-5.6-sol-max
"reflect judgment, divergent, synthesizer": claude-fable-5-thinking-max
"arena runners":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"arena cross-judge pool":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"swarm workers": grok-4.5-fast-xhigh
"architect runners":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
"interrogate reviewers":
  - claude-fable-5-thinking-max
  - gpt-5.6-sol-max
  - grok-4.5-fast-xhigh
  - claude-opus-5-thinking-xhigh
```

Replace default slugs with detected OMP-available ids when the defaults are not installed.
Keep role **structure** (scalar vs list) even when swapping models.

### 6. Confirm

Tell the user:

1. path written (`~/.omp/agent/pstack.yaml`)
2. it applies to **new** skill runs / sessions
3. re-run `/setup-pstack` anytime to update
4. named agents still configured via OMP `/agents`

### 7. Optional verification skill

If the project has no way to drive the real app for proof, offer once to run
`create-verification-skill`. On no, move on.

## Spawning workers after setup

When pstack skills fan out work on OMP:

- use the **Task** tool with `agent: "task"` (generic) or `agent: "poteto-agent"` when style must match poteto-mode
- set `model:` from `~/.omp/agent/pstack.yaml` for that role (omit model when value is `inherit-parent` / `auto`)
- do **not** use Cursor `subagent_type: generalPurpose`, Cursor `AskQuestion`, or “Cursor cloud agent” wording
