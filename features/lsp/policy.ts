/**
 * Surfacing policy: severity floor, per-file/per-turn caps, source filters.
 * Ported from droid-lsp `internal/policy` — omp's flat 50-cap is not enough
 * for the semgrep/snyk server set.
 */
import type { Diagnostic } from "./types.ts";

export interface PolicyConfig {
	/** Drop diagnostics above this severity (1=error only, 2=+warnings, 3=+info, 4=everything). Default 2. */
	readonly minSeverity: number;
	/** Cap per single file. Default 20. */
	readonly maxPerFile: number;
	/** Cap across one surfaced batch. Default 50. */
	readonly maxPerTurn: number;
	/** Drop diagnostics whose `source` matches any entry (exact, case-insensitive). */
	readonly deniedSources: readonly string[];
}

export const DEFAULT_POLICY: PolicyConfig = {
	minSeverity: 2,
	maxPerFile: 20,
	maxPerTurn: 50,
	deniedSources: [],
};

/** Merge user config overrides (all-optional) onto the defaults at the boundary. */
export function mergePolicy(overrides?: {
	readonly minSeverity?: number;
	readonly maxPerFile?: number;
	readonly maxPerTurn?: number;
	readonly deniedSources?: readonly string[];
}): PolicyConfig {
	if (!overrides) return DEFAULT_POLICY;
	return {
		minSeverity: overrides.minSeverity ?? DEFAULT_POLICY.minSeverity,
		maxPerFile: overrides.maxPerFile ?? DEFAULT_POLICY.maxPerFile,
		maxPerTurn: overrides.maxPerTurn ?? DEFAULT_POLICY.maxPerTurn,
		deniedSources: overrides.deniedSources ?? DEFAULT_POLICY.deniedSources,
	};
}

export function applyPolicy(diagnostics: readonly Diagnostic[], policy: PolicyConfig = DEFAULT_POLICY): Diagnostic[] {
	const denied = new Set(policy.deniedSources.map(source => source.toLowerCase()));
	const filtered = diagnostics.filter(d => {
		if ((d.severity ?? 1) > policy.minSeverity) return false;
		if (d.source && denied.has(d.source.toLowerCase())) return false;
		return true;
	});
	return filtered.slice(0, Math.max(0, policy.maxPerFile));
}

/** Batch-level cap applied after per-file filtering (maxPerTurn). */
export function capTurn(diagnostics: readonly Diagnostic[], policy: PolicyConfig = DEFAULT_POLICY): Diagnostic[] {
	return diagnostics.slice(0, Math.max(0, policy.maxPerTurn));
}
