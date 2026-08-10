---
description: "OMP: configure pstack workflow-role models into ~/.omp/agent/pstack.yaml via the setup-pstack skill. Does not edit task.agentModelOverrides."
---

You are on **OMP (oh-my-pi)**, not Cursor.

1. Read and execute the setup-pstack skill completely (skills/setup-pstack/SKILL.md or skill://setup-pstack).
2. Detect models with `omp models` (not a Cursor model picker).
3. Write **only** `~/.omp/agent/pstack.yaml`.
4. Never write `~/.cursor/rules/*` or any `.mdc` rule file.
5. Do not change OMP /agents settings unless the user explicitly asks; those live in `~/.omp/agent/config.yml` as task.agentModelOverrides.
