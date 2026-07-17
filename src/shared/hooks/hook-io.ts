/**
 * Shared stdin/stdout helpers for Cursor command hooks.
 * Always emit via JSON.stringify — never shell-string-build JSON.
 */

export async function readHookInput(): Promise<unknown> {
	const text = await Bun.stdin.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return {};
	}
}

export type HookPermissionOutput = {
	permission: "allow" | "deny";
	agent_message?: string;
	user_message?: string;
};

export function writeHookOutput(output: HookPermissionOutput | GateResultLike): void {
	process.stdout.write(JSON.stringify(output));
}

type GateResultLike = {
	permission: "allow" | "deny";
	agent_message?: string;
	user_message?: string;
};

export function allow(): HookPermissionOutput {
	return { permission: "allow" };
}

export function deny(agentMessage: string, userMessage?: string): HookPermissionOutput {
	const out: HookPermissionOutput = {
		permission: "deny",
		agent_message: agentMessage,
	};
	if (userMessage) out.user_message = userMessage;
	return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract command from preToolUse (tool_input.command) or beforeShellExecution (command). */
export function extractCommand(input: unknown): string | undefined {
	if (!isObject(input)) return undefined;

	if (typeof input.command === "string") return input.command;

	const toolInput = input.tool_input;
	if (isObject(toolInput) && typeof toolInput.command === "string") {
		return toolInput.command;
	}

	// Some payloads nest under toolInput / arguments
	const alt = input.toolInput ?? input.arguments;
	if (isObject(alt) && typeof alt.command === "string") {
		return alt.command;
	}

	return undefined;
}
