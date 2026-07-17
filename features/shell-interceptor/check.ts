import { commandsToCheck } from "./cd-normalize.ts";
import { DEFAULT_SHELL_INTERCEPTOR_RULES } from "./default-rules.ts";
import type { CapabilityId, InterceptionResult, ShellInterceptorRule } from "./types.ts";

/**
 * Compile shell interceptor rules into regexes, skipping invalid patterns.
 */
function compileRules(
	rules: ShellInterceptorRule[],
): Array<{ rule: ShellInterceptorRule; regex: RegExp }> {
	const compiled: Array<{ rule: ShellInterceptorRule; regex: RegExp }> = [];
	for (const rule of rules) {
		const flags = rule.flags ?? "";
		try {
			compiled.push({ rule, regex: new RegExp(rule.pattern, flags) });
		} catch {
			// Skip invalid regex patterns
		}
	}
	return compiled;
}

/**
 * Check if a shell command should be intercepted (omp `checkBashInterception` parity).
 *
 * @param command The command to check
 * @param activeCapabilities Capability IDs that are enabled (omp `availableTools`)
 * @param rules Rules to apply (`[]` disables all; omit for defaults)
 */
export function checkShellInterception(
	command: string,
	activeCapabilities: CapabilityId[] | string[],
	rules: ShellInterceptorRule[] = DEFAULT_SHELL_INTERCEPTOR_RULES,
): InterceptionResult {
	const normalizedCommand = command.trim();
	const compiled = compileRules(rules);

	for (const { rule, regex } of compiled) {
		if (!activeCapabilities.includes(rule.capability)) {
			continue;
		}

		if (regex.test(normalizedCommand)) {
			return {
				block: true,
				message: `Blocked: ${rule.message}\n\nOriginal command: ${command}`,
				suggestedCapability: rule.capability,
			};
		}
	}

	return { block: false };
}

/**
 * Dual-check: original command + post-`cd … &&` normalized form (omp bash.ts parity).
 */
export function checkShellInterceptionWithCd(
	rawCommand: string,
	activeCapabilities: CapabilityId[] | string[],
	rules: ShellInterceptorRule[] = DEFAULT_SHELL_INTERCEPTOR_RULES,
): InterceptionResult {
	for (const commandToCheck of commandsToCheck(rawCommand)) {
		const result = checkShellInterception(commandToCheck, activeCapabilities, rules);
		if (result.block) return result;
	}
	return { block: false };
}
