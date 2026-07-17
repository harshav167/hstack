/**
 * Stable capability IDs used by shell-interceptor rules and config.
 * Wire names (what Cursor emits) live in the native-tools registry — not here.
 */
export type CapabilityId = "read" | "grep" | "glob" | "edit" | "write" | "hub";

export interface ShellInterceptorRule {
	/** Regex pattern (omp byte-parity). */
	pattern: string;
	/** Optional RegExp flags. */
	flags?: string;
	/** Stable capability ID (omp `tool` remapped). */
	capability: CapabilityId;
	/** Human message; deny formatter wraps with Blocked: + Original command. */
	message: string;
}

export interface InterceptionResult {
	block: boolean;
	message?: string;
	suggestedCapability?: CapabilityId;
}

export interface GateResult {
	permission: "allow" | "deny";
	agent_message?: string;
	user_message?: string;
}
