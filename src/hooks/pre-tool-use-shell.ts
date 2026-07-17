#!/usr/bin/env bun
/**
 * preToolUse hook — matcher Shell.
 * Denies shell commands that shadow native tools (omp bash interceptor parity).
 */
import { evaluateShellCommand } from "../../features/shell-interceptor/evaluate.ts";
import { loadConfig } from "../shared/config/load.ts";
import { allow, extractCommand, readHookInput, writeHookOutput } from "../shared/hooks/hook-io.ts";

async function main(): Promise<void> {
	try {
		const input = await readHookInput();
		const command = extractCommand(input);
		if (!command) {
			writeHookOutput(allow());
			return;
		}
		const config = loadConfig();
		const result = evaluateShellCommand(command, config);
		writeHookOutput(result);
	} catch {
		// failClosed is set in hooks.json — empty deny on unexpected failure
		writeHookOutput({
			permission: "deny",
			agent_message: "hstack: shell interceptor failed; command denied (failClosed)",
			user_message: "hstack hook error",
		});
	}
}

await main();
