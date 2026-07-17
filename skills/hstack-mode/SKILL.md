---
name: Hstack Mode
description: >-
  Native-tools-first agent style for hstack. Prefer Read/Grep/Glob/StrReplace/Write/Task
  over Shell; respect hard denies; extend the stack without bolting onto shell-interceptor.
  Use for hstack, /hstack-mode, or requests to work native-tools-first.
disable-model-invocation: true
mode: true
icon: shield
color: blue
reminder: About to Shell for read/search/edit? Use the native tool instead. Casual turn or user opts out -> don't force the mode.
---

# Hstack mode

Sticky posture while this mode is selected. Soft guidance always rides along via `native-tools-first` rules; this mode makes the preference **explicit and sticky** in the mode picker (same mechanism as pstack's Poteto Mode).

## Non-negotiables

1. **Native before Shell.** File read → `Read`/`ReadFile`. Search → `Grep`/`rg`. Paths → `Glob`. Edit → `StrReplace`/`ApplyPatch`. Create/overwrite → `Write`/`ApplyPatch`. Long-running → `Task`/`Subagent`.
2. **If hstack denies a Shell call, do not retry the same shell pattern.** Follow the deny message aliases and call the named native tool.
3. **Shell is for computing facts and real CLI work** (`wc`, `diff`, `git`, build/test) — not for reading, grepping, or editing files.
4. **Wire names vary by session.** Never detect model family. Use whichever alias the session exposes (`Read` or `ReadFile`, `Grep` or `rg`, …). Inventory lives in `/native-tools`.
5. **Extending hstack** → `/hstack-authoring`. New feature = new `features/<name>/` + wiring. Never bolt TTSR (or anything else) into `shell-interceptor/`.

## When Shell is correct

- Device sinks: `echo x > /dev/null`
- Finite builds/tests without watch: `bun test`, `docker compose up -d`
- Git porcelain that needs the real CLI
- Process control with no native equivalent

## Soft web/browser (not hard-denied in v1)

Prefer `WebFetch`/`WebSearch` and `browser_*` over `curl`/`wget` scrapes. See `/native-tools`.

## Subagents

For delegates that must keep this posture, use `subagent_type: "hstack-agent"` when available. Substituting `generalPurpose` skips this skill and drifts back to Shell.

## Opt out

Say so, or switch the mode picker away from **Hstack Mode**. Hooks still hard-deny shadowed Shell either way.
