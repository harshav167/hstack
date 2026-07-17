# Changelog

## [0.2.0](https://github.com/harshav167/hstack/compare/v0.1.0...v0.2.0) (2026-07-17)


### Features

* add Hstack Mode (mode: true) for Custom Modes picker ([f9fbc09](https://github.com/harshav167/hstack/commit/f9fbc093fa6f50c3a888006c7e30dfd385f22f61))


### Bug Fixes

* add marketplace.json for github /add-plugin import ([e7ab103](https://github.com/harshav167/hstack/commit/e7ab10310f9e87f43c76dc925afb60e5fa4c6878))
* declare only real plugin paths so cursor can detect hstack ([3246c8c](https://github.com/harshav167/hstack/commit/3246c8c33511e1f7f1e603534d6f1120956c7579))

## [Unreleased]

## [0.1.0] - 2026-07-17

### Added

- Shell interceptor (omp-parity): hard-deny Shell/terminal commands that shadow native tools (`read`/`grep`/`glob`/`edit`/`write`/`hub` capabilities)
- Native capability registry with wire-name aliases (`Read`/`ReadFile`, `Grep`/`rg`, `StrReplace`/`ApplyPatch`, `Task`/`Subagent`, …)
- Soft guidance: `rules/native-tools-first.mdc`, `skills/native-tools`, `skills/hstack-authoring`, `skills/setup-hstack`, `skills/hstack-mode` (Custom Mode via `mode: true`)
- Agent: `agents/hstack-agent.md` for `subagent_type: "hstack-agent"`
- Config at `~/.hstack/config.json` (`shellInterceptor.enabled` default `true`)
- Plugin shape: `.cursor-plugin/marketplace.json` for github `/add-plugin`, reserved dirs for future surfaces
- CI + release-please (auto-bump `package.json` + `.cursor-plugin/plugin.json`)
