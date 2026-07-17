# Changelog

## [Unreleased]

## [0.1.0] - 2026-07-17

### Added

- Shell interceptor (omp-parity): hard-deny Shell/terminal commands that shadow native tools (`read`/`grep`/`glob`/`edit`/`write`/`hub` capabilities)
- Native capability registry with wire-name aliases (`Read`/`ReadFile`, `Grep`/`rg`, `StrReplace`/`ApplyPatch`, `Task`/`Subagent`, …)
- Soft guidance: `rules/native-tools-first.mdc`, `skills/native-tools`, `skills/hstack-authoring`, `skills/setup-hstack`
- Config at `~/.hstack/config.json` (`shellInterceptor.enabled` default `true`)
- Plugin shape aligned with pstack-style growth: reserved `agents/` / `commands/` / `mcp/`, vision-first README
- CI + release-please (auto-bump `package.json` + `.cursor-plugin/plugin.json`)
