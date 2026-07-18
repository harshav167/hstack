/**
 * LSP server config: discovery, normalization, and omp-faithful merge.
 *
 * Sources, lowest to highest priority:
 *   1. Bundled `servers.json` (the user's curated set)
 *   2. `~/.hstack/lsp.json`
 *   3. Project-root `lsp.json` / `.lsp.json`
 *
 * Merge semantics mirror omp `lsp/config.ts`: override-by-name, `disabled`
 * filters, `rootMarkers` + binary-availability gating. Config file shape is
 * omp's `lsp.json` shape, so copying `~/.omp/agent/lsp.json` here works
 * unchanged.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import BUNDLED_SERVERS from "./servers.json" with { type: "json" };
import { isObject, type LspConfig, type ServerConfig } from "./types.ts";

type RawServerConfig = Partial<ServerConfig> & Record<string, unknown>;

interface NormalizedConfig {
	servers: Record<string, RawServerConfig>;
	idleTimeoutMs?: number;
}

function normalizeConfig(value: unknown): NormalizedConfig | null {
	if (!isObject(value)) return null;
	const idleTimeoutMs = typeof value.idleTimeoutMs === "number" ? value.idleTimeoutMs : undefined;
	const rawServers = value.servers;
	if (isObject(rawServers)) {
		return { servers: rawServers as Record<string, RawServerConfig>, idleTimeoutMs };
	}
	// omp-compatible shorthand: a bare server map at the root
	// (`{ "snyk": { "disabled": true } }`) — mirrors omp normalizeConfig.
	const servers = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "idleTimeoutMs"));
	if (Object.keys(servers).length > 0 && Object.values(servers).every(isObject)) {
		return { servers: servers as Record<string, RawServerConfig>, idleTimeoutMs };
	}
	return { servers: {}, idleTimeoutMs };
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const items = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
	return items.length > 0 ? items : null;
}

function normalizeServerConfig(config: RawServerConfig): ServerConfig | null {
	const command = typeof config.command === "string" && config.command.length > 0 ? config.command : null;
	const fileTypes = normalizeStringArray(config.fileTypes);
	const rootMarkers = normalizeStringArray(config.rootMarkers);
	if (!command || !fileTypes || !rootMarkers) return null;

	const args = Array.isArray(config.args)
		? config.args.filter((entry): entry is string => typeof entry === "string")
		: undefined;
	const initOptions = isObject(config.initOptions) ? config.initOptions : undefined;
	const settings = isObject(config.settings) ? config.settings : undefined;

	return {
		...config,
		command,
		fileTypes,
		rootMarkers,
		...(args ? { args } : {}),
		...(initOptions ? { initOptions } : {}),
		...(settings ? { settings } : {}),
		...(config.disabled === true ? { disabled: true } : {}),
		...(config.isLinter === true ? { isLinter: true } : {}),
		...(config.defer === true ? { defer: true } : {}),
		...(config.pullDiagnostics === true ? { pullDiagnostics: true } : {}),
	};
}

function coerceServerConfigs(servers: Record<string, RawServerConfig>): Record<string, ServerConfig> {
	const result: Record<string, ServerConfig> = {};
	for (const [name, config] of Object.entries(servers)) {
		const normalized = normalizeServerConfig(config);
		if (normalized) result[name] = normalized;
	}
	return result;
}

/** Recursive merge for nested option objects (initOptions, settings). */
function deepMergeObjects(
	base: Record<string, unknown> | undefined,
	override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!base) return override;
	if (!override) return base;
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const existing = out[key];
		out[key] = isObject(existing) && isObject(value) ? deepMergeObjects(existing, value) : value;
	}
	return out;
}

function mergeServers(
	base: Record<string, ServerConfig>,
	overrides: Record<string, RawServerConfig>,
): Record<string, ServerConfig> {
	const merged: Record<string, ServerConfig> = { ...base };
	for (const [name, config] of Object.entries(overrides)) {
		const existing = merged[name];
		// Deep-merge initOptions/settings so a user override carrying only
		// `initOptions.token` (or one semgrep scan field) doesn't wipe the rest.
		const candidate = existing
			? {
					...existing,
					...config,
					initOptions: deepMergeObjects(existing.initOptions, isObject(config.initOptions) ? config.initOptions : undefined),
					settings: deepMergeObjects(existing.settings, isObject(config.settings) ? config.settings : undefined),
				}
			: config;
		const normalized = normalizeServerConfig(candidate);
		if (normalized) merged[name] = normalized;
	}
	return merged;
}

function readConfigFile(filePath: string): NormalizedConfig | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return normalizeConfig(parsed);
	} catch {
		return null;
	}
}

export function hasRootMarkers(dir: string, markers: readonly string[]): boolean {
	let entries: string[] | null = null;
	for (const marker of markers) {
		if (marker.includes("*")) {
			if (entries === null) {
				try {
					entries = fs.readdirSync(dir);
				} catch {
					entries = [];
				}
			}
			const glob = new Bun.Glob(marker);
			for (const entry of entries) {
				if (glob.match(entry)) return true;
			}
			continue;
		}
		if (fs.existsSync(path.join(dir, marker))) return true;
	}
	return false;
}

/** Resolve a command to an executable path: project-local bin dirs, then $PATH. */
export function resolveCommand(command: string, cwd: string): string | null {
	if (command.includes("/")) {
		// Slash-bearing commands resolve against the project root, not the
		// daemon's own cwd — a project lsp.json entry like ./bin/server works.
		const resolved = path.isAbsolute(command) ? command : path.resolve(cwd, command);
		return fs.existsSync(resolved) ? resolved : null;
	}
	const local = path.join(cwd, "node_modules", ".bin", command);
	if (fs.existsSync(local)) return local;
	return Bun.which(command);
}

export function userLspConfigPath(): string {
	return path.join(os.homedir(), ".hstack", "lsp.json");
}

/**
 * Merge server configs for `cwd` without availability gating.
 * Pure merge of bundled → user → project sources; binary/root-marker
 * filtering happens in loadServerConfig. Exported for hermetic tests.
 */
export function loadMergedServerConfig(cwd: string): LspConfig {
	let merged = coerceServerConfigs(BUNDLED_SERVERS as Record<string, RawServerConfig>);
	let idleTimeoutMs: number | undefined;

	for (const filePath of [userLspConfigPath(), path.join(cwd, "lsp.json"), path.join(cwd, ".lsp.json")]) {
		const parsed = readConfigFile(filePath);
		if (!parsed) continue;
		if (Object.keys(parsed.servers).length > 0) {
			merged = mergeServers(merged, parsed.servers);
		}
		if (parsed.idleTimeoutMs !== undefined) idleTimeoutMs = parsed.idleTimeoutMs;
	}

	return { servers: merged, idleTimeoutMs };
}

/**
 * Load and merge server configs for `cwd`, gated to servers whose root markers
 * match the project and whose binary resolves. Missing/invalid files are skipped;
 * the bundled table always applies.
 */
export function loadServerConfig(cwd: string): LspConfig {
	const { servers: merged, idleTimeoutMs } = loadMergedServerConfig(cwd);

	const available: Record<string, ServerConfig> = {};
	for (const [name, config] of Object.entries(merged)) {
		if (config.disabled) continue;
		if (!hasRootMarkers(cwd, config.rootMarkers)) continue;
		const resolved = resolveCommand(config.command, cwd);
		if (!resolved) continue;
		available[name] = { ...config, resolvedCommand: resolved };
	}

	return { servers: available, idleTimeoutMs };
}

/** All servers matching a file, primary (non-linter) first. Mirrors omp `getServersForFile`. */
export function getServersForFile(config: LspConfig, filePath: string): Array<[string, ServerConfig]> {
	const ext = path.extname(filePath).toLowerCase();
	const extNoDot = ext.startsWith(".") ? ext.slice(1) : ext;
	const fileName = path.basename(filePath).toLowerCase();
	const matches: Array<[string, ServerConfig]> = [];

	for (const [name, serverConfig] of Object.entries(config.servers)) {
		const supportsFile = serverConfig.fileTypes.some(fileType => {
			const normalized = fileType.toLowerCase();
			const normalizedNoDot = normalized.startsWith(".") ? normalized.slice(1) : normalized;
			return (
				normalized === ext || normalized === fileName || normalizedNoDot === extNoDot || normalizedNoDot === fileName
			);
		});
		if (supportsFile) matches.push([name, serverConfig]);
	}

	return matches.sort((a, b) => Number(a[1].isLinter ?? false) - Number(b[1].isLinter ?? false));
}
