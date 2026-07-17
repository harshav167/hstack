---
name: hstack-authoring
description: >-
  How to add a new hstack feature (gate, injector, command, agent, MCP). Use when
  extending hstack beyond the shell interceptor — e.g. TTSR, new hooks, or
  sibling config keys. Mirrors pstack's grow-the-plugin shape.
---

# adding a feature to hstack

hstack is a cursor plugin you grow. v1 only fills `features/shell-interceptor/`. new work = new folder + wiring — **never** edit an existing feature to bolt on unrelated logic. same idea as pstack shipping playbooks/skills over time without rewriting the core.

## feature kinds

| kind | purpose | cursor surfaces |
| ---- | ------- | --------------- |
| **gate** | block bad action before it runs | `preToolUse`, `beforeShellExecution` → `permission: deny` |
| **injector** | react to output; inject guidance | `afterAgentThought`, `postToolUse` (`additional_context`), `stop` |
| **command** | user slash command | `commands/*.md` |
| **agent** | subagent def | `agents/*.md` |
| **rule** / **skill** | soft guidance | `rules/*.mdc`, `skills/*/SKILL.md` |
| **mcp** | long-running service | `mcp/` + `plugin.json` |

example future feature: **TTSR** (time-traveling stream rules from oh-my-pi) — kind **injector**, lives in `features/ttsr/`, not inside shell-interceptor.

## recipe

1. create `features/<name>/` with pure logic + `test/features/<name>.test.ts`
2. add a **sibling** config key in `src/shared/config/schema.ts` (e.g. `ttsr?: …`) — never nest under `shellInterceptor`
3. wire only the surfaces you need:
   - gate → `hooks/hooks.json` + `src/hooks/<event>-<name>.ts` using `src/shared/hooks/hook-io.ts`
   - injector → hooks returning `additional_context` / `followup_message`
   - user CLI → `commands/<name>.md`
   - subagent → `agents/<name>.md`
   - agent doc → `skills/<name>/SKILL.md`
   - service → `mcp/` entry
4. register new surface roots in `.cursor-plugin/plugin.json` only if missing
5. mention the feature in the README under **what's shipping** / **not shipped here** — keep the vision section stable

shared runtime only: `hook-io.ts`, `config/load.ts`. feature-specific types stay inside `features/<name>/`.

## TTSR notes (when you port it)

- reuse omp `TtsrManager` matcher/tests; map injection to cursor event-boundary hooks
- mid-stream abort + same-turn retry is a **cursor platform gap** — document partial parity
- config: `{ "ttsr": { "enabled": false, ... } }` sibling to `shellInterceptor`
