import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CapabilityId, ShellInterceptorRule } from "../../../features/shell-interceptor/types.ts";
import {
	DEFAULT_HSTACK_CONFIG,
	DEFAULT_SHELL_INTERCEPTOR_CONFIG,
	type HstackConfig,
	type LspFeatureConfigKey,
	type LspPolicyConfigKey,
	type ShellInterceptorConfig,
	type TtsrConfigStub,
} from "./schema.ts";

export function configPath(): string {
	return path.join(os.homedir(), ".hstack", "config.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePatterns(raw: unknown): ShellInterceptorRule[] | null {
	if (raw === null || raw === undefined) return null;
	if (!Array.isArray(raw)) return null;
	const rules: ShellInterceptorRule[] = [];
	for (const item of raw) {
		if (!isObject(item)) continue;
		if (typeof item.pattern !== "string") continue;
		if (typeof item.capability !== "string") continue;
		if (typeof item.message !== "string") continue;
		const rule: ShellInterceptorRule = {
			pattern: item.pattern,
			capability: item.capability as CapabilityId,
			message: item.message,
		};
		if (typeof item.flags === "string") rule.flags = item.flags;
		rules.push(rule);
	}
	return rules;
}

function parseShellInterceptor(raw: unknown): ShellInterceptorConfig {
	if (!isObject(raw)) return { ...DEFAULT_SHELL_INTERCEPTOR_CONFIG };

	const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;

	let activeCapabilities = DEFAULT_SHELL_INTERCEPTOR_CONFIG.activeCapabilities;
	if (Array.isArray(raw.activeCapabilities)) {
		activeCapabilities = raw.activeCapabilities.filter((c): c is string => typeof c === "string") as CapabilityId[];
	}

	const patterns = parsePatterns(raw.patterns);

	return { enabled, activeCapabilities, patterns };
}

function parseLspPolicy(raw: unknown): LspPolicyConfigKey | undefined {
	if (!isObject(raw)) return undefined;
	const policy: {
		minSeverity?: number;
		maxPerFile?: number;
		maxPerTurn?: number;
		deniedSources?: string[];
	} = {};
	if (typeof raw.minSeverity === "number") policy.minSeverity = raw.minSeverity;
	if (typeof raw.maxPerFile === "number") policy.maxPerFile = raw.maxPerFile;
	if (typeof raw.maxPerTurn === "number") policy.maxPerTurn = raw.maxPerTurn;
	if (Array.isArray(raw.deniedSources)) {
		policy.deniedSources = raw.deniedSources.filter((s): s is string => typeof s === "string");
	}
	return Object.keys(policy).length > 0 ? (policy as LspPolicyConfigKey) : undefined;
}

function parseRoot(parsed: unknown): HstackConfig {
	if (!isObject(parsed)) return { ...DEFAULT_HSTACK_CONFIG };
	const shellInterceptor = parseShellInterceptor(parsed.shellInterceptor);
	const ttsr = isObject(parsed.ttsr) ? (parsed.ttsr as TtsrConfigStub) : undefined;
	let lsp: LspFeatureConfigKey | undefined;
	if (isObject(parsed.lsp)) {
		const policy = parseLspPolicy(parsed.lsp.policy);
		lsp = {
			enabled: typeof parsed.lsp.enabled === "boolean" ? parsed.lsp.enabled : undefined,
			inlineTimeoutMs: typeof parsed.lsp.inlineTimeoutMs === "number" ? parsed.lsp.inlineTimeoutMs : undefined,
			idleTimeoutMs: typeof parsed.lsp.idleTimeoutMs === "number" ? parsed.lsp.idleTimeoutMs : undefined,
			...(policy ? { policy } : {}),
		};
	}
	return {
		shellInterceptor,
		...(ttsr ? { ttsr } : {}),
		...(lsp ? { lsp } : {}),
	};
}

/**
 * Load ~/.hstack/config.json. Missing / invalid → defaults (enabled: true).
 * Never throws — hooks must not crash on config I/O.
 */
export function loadConfig(filePath: string = configPath()): HstackConfig {
	try {
		const content = fs.readFileSync(filePath, "utf8");
		return parseRoot(JSON.parse(content) as unknown);
	} catch {
		return {
			shellInterceptor: { ...DEFAULT_SHELL_INTERCEPTOR_CONFIG },
		};
	}
}

export async function loadConfigAsync(filePath: string = configPath()): Promise<HstackConfig> {
	try {
		const parsed: unknown = await Bun.file(filePath).json();
		return parseRoot(parsed);
	} catch {
		return {
			shellInterceptor: { ...DEFAULT_SHELL_INTERCEPTOR_CONFIG },
		};
	}
}
