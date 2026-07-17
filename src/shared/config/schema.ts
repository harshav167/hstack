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
	enabled: boolean;
	/** Capability IDs from the registry — not wire names. */
	activeCapabilities: CapabilityId[];
	/**
	 * `null` / omitted → bundled defaults.
	 * `[]` → allow all (omp contract: empty patterns disables rules).
	 * non-empty → replace defaults.
	 */
	patterns: ShellInterceptorRule[] | null;
}

/** Future TTSR settings stub — not loaded or enforced in v1. */
export interface TtsrConfigStub {
	enabled?: boolean;
	interruptMode?: "always" | "never" | string;
	repeatMode?: "once" | "always" | string;
	builtinRules?: boolean;
	disabledRules?: string[];
}

export interface HstackConfig {
	shellInterceptor: ShellInterceptorConfig;
	/** Reserved for Time-Traveling Stream Rules port — not wired in v1. */
	ttsr?: TtsrConfigStub;
}

export const DEFAULT_SHELL_INTERCEPTOR_CONFIG: ShellInterceptorConfig = {
	enabled: true,
	activeCapabilities: [...DEFAULT_ACTIVE_CAPABILITIES],
	patterns: null,
};

export const DEFAULT_HSTACK_CONFIG: HstackConfig = {
	shellInterceptor: { ...DEFAULT_SHELL_INTERCEPTOR_CONFIG },
};
