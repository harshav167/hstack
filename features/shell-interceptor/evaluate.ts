import type { HstackConfig } from "../../src/shared/config/schema.ts";
import { checkShellInterceptionWithCd } from "./check.ts";
import { DEFAULT_SHELL_INTERCEPTOR_RULES } from "./default-rules.ts";
import type { GateResult, ShellInterceptorRule } from "./types.ts";

/**
 * Evaluate a shell command against hstack config → Cursor hook GateResult.
 */
export function evaluateShellCommand(command: string, config: HstackConfig): GateResult {
	const si = config.shellInterceptor;
	if (!si.enabled) {
		return { permission: "allow" };
	}

	// patterns: [] → allow all (omp empty-rules contract)
	const rules: readonly ShellInterceptorRule[] =
		si.patterns === null ? DEFAULT_SHELL_INTERCEPTOR_RULES : si.patterns;

	if (rules.length === 0) {
		return { permission: "allow" };
	}

	const result = checkShellInterceptionWithCd(command, si.activeCapabilities, rules);
	if (!result.block) {
		return { permission: "allow" };
	}

	const agentMessage = result.message ?? "Command blocked";
	return {
		permission: "deny",
		agent_message: agentMessage,
		user_message: "hstack blocked a shell command that shadows a native tool",
	};
}
