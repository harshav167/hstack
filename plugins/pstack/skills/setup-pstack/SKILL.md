---
name: setup-pstack
description: "Configure which models pstack uses per workflow role. Detects available models and writes ~/.omp/agent/pstack.yaml. Use for /setup-pstack, configure pstack models, or changing pstack model choices."
---

# Setup pstack

Write `~/.omp/agent/pstack.yaml`, a small YAML file that sets pstack's model per workflow role. Skills read it and fall back to their inline defaults when a key is absent, so this is an override layer, not a requirement.

This is **not** the same as OMP `/agents` → `task.agentModelOverrides` (those override named agent *types* like `poteto-agent`). setup-pstack configures **skill/workflow roles** (how critics, arena runners, swarm workers, …).

## Steps

### 1. Detect available models

Enumerate the model slugs you can pass to a `Task` subagent in this session; that is the dependable source. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The aliases `inherit-parent` and `auto` are always valid even though they are not detected slugs.

### 2. Load current state

The default role-to-model mapping is the shape shown in step 5 below. If `~/.omp/agent/pstack.yaml` already exists, read it and treat its values as the current choices. Otherwise start from those defaults.

Also note: named OMP agents shipped by this package (`poteto-agent`, `comment-sicko`) can still be overridden later via OMP's `/agents` UI, which writes `task.agentModelOverrides` in `~/.omp/agent/config.yml`. Do not put those agent-type overrides into pstack.yaml.

### 3. Map and confirm

Show every role with its current model, marking any real slug not in the detected set as needing a choice. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model) as the options. Prefer a structured multiple-choice ask over free text.

For panel roles (`how critics`, `arena runners`, `architect runners`, `interrogate reviewers`) the value is a **list**, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from the parent's when possible. `swarm workers` is a single default model for every worker unless a race names a model per arm.

### 4. Validate

Every real slug written must be in the detected set; `inherit-parent` and `auto` always pass. If a chosen real slug is not available, stop and ask again.

### 5. Write the config

Write `~/.omp/agent/pstack.yaml` as YAML. Overwrite the whole file so re-runs stay idempotent. Use quoted keys (role labels contain commas/spaces). List roles are YAML arrays.

```yaml
# pstack model configuration. Delete a key to fall back to the skill default.
# inherit-parent / auto: role runs on the parent chat model (omit Task model).
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

Create `~/.omp/agent/` if needed. Do not write Cursor rules.

### 6. Confirm

Tell the user the file was written and that it applies to new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke that skill. On no, move on without pushing.
