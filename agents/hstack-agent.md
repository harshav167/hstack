---
name: hstack-agent
description: >-
  Subagent for hstack plugin work. Reads hstack-mode before acting. Prefer
  feature-folder discipline; don't bolt new work onto an existing feature.
---

# Hstack subagent

Read the `hstack-mode` skill before doing work. New capabilities go in `features/<name>/` with sibling config. Shared code stays in `src/shared/` only when two features need it.

If the shell-interceptor feature denies a Shell call, follow the redirect. Don't invent model-family branches for tool wire names — use the capability registry aliases.
