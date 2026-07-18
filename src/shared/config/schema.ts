import type { CapabilityId, ShellInterceptorRule } from "../../../features/shell-interceptor/types.ts";
import { DEFAULT_ACTIVE_CAPABILITIES } from "../../../features/shell-interceptor/default-rules.ts";

/**
 * Config schema for ~/.hstack/config.json
 *
 * Feature keys are siblings. v1 wires only `shellInterceptor`.
 * `ttsr?` is a types-only stub so a future feature does not refactor this shape.
 */

export interface ShellInterceptorConfig {
	/** Default true (omp defaults false — intentional product delta). */
	readonly enabled: boolean;
	/** Capability IDs from the registry — not wire names. */
	readonly activeCapabilities: readonly CapabilityId[];
	/**
	 * `null` / omitted → bundled defaults.
	 * `[]` → allow all (omp contract: empty patterns disables rules).
	 * non-empty → replace defaults.
	 */
	readonly patterns: readonly ShellInterceptorRule[] | null;
}

/** Future TTSR settings stub — not loaded or enforced in v1. */
export interface TtsrConfigStub {
	readonly enabled?: boolean;
	readonly interruptMode?: "always" | "never" | string;
	readonly repeatMode?: "once" | "always" | string;
	readonly builtinRules?: boolean;
	readonly disabledRules?: readonly string[];
}

/** Diagnostic surfacing policy overrides. Mirrors features/lsp/policy.ts PolicyConfig. */
export interface LspPolicyConfigKey {
	/** Drop diagnostics above this severity (1=error only, 2=+warnings, 3=+info, 4=everything). */
	readonly minSeverity?: number;
	/** Cap per single file. */
	readonly maxPerFile?: number;
	/** Cap across one surfaced batch (one hook turn). */
	readonly maxPerTurn?: number;
	/** Drop diagnostics whose `source` matches any entry (exact, case-insensitive). */
	readonly deniedSources?: readonly string[];
}

/** LSP diagnostics feature settings. Server tables live in lsp.json, not here. */
export interface LspFeatureConfigKey {
	/** Default true. Master switch for the lsp hooks (daemon still idles out on its own). */
	readonly enabled?: boolean;
	/** Inline wait budget per write before slow servers move to the stop-hook channel. Default 800. */
	readonly inlineTimeoutMs?: number;
	/** Daemon global idle shutdown in ms. Default 30 minutes. */
	readonly idleTimeoutMs?: number;
	/** Surfacing policy overrides; omitted keys fall back to the daemon defaults. */
	readonly policy?: LspPolicyConfigKey;
}

export interface HstackConfig {
	readonly shellInterceptor: ShellInterceptorConfig;
	/** Reserved for Time-Traveling Stream Rules port — not wired in v1. */
	readonly ttsr?: TtsrConfigStub;
	readonly lsp?: LspFeatureConfigKey;
}

export const DEFAULT_SHELL_INTERCEPTOR_CONFIG: ShellInterceptorConfig = {
	enabled: true,
	activeCapabilities: [...DEFAULT_ACTIVE_CAPABILITIES],
	patterns: null,
};

export const DEFAULT_HSTACK_CONFIG: HstackConfig = {
	shellInterceptor: { ...DEFAULT_SHELL_INTERCEPTOR_CONFIG },
};
