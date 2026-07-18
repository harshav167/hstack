import { describe, expect, test } from "bun:test";
import * as path from "node:path";

const HOOKS = path.join(import.meta.dir, "..", "..", "src", "hooks");

interface RunResult {
	readonly stdout: string;
	readonly exitCode: number;
}

async function runHook(script: string, payload: unknown, timeoutMs = 15_000): Promise<RunResult> {
	const proc = Bun.spawn([process.execPath, path.join(HOOKS, script)], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env },
	});
	proc.stdin.write(JSON.stringify(payload));
	proc.stdin.end();
	const stdout = await new Response(proc.stdout).text();
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const exitCode = await proc.exited;
	clearTimeout(timer);
	return { stdout: stdout.trim(), exitCode };
}

function parseOutput(result: RunResult): Record<string, unknown> {
	expect(result.exitCode).toBe(0);
	expect(result.stdout.startsWith("{")).toBe(true);
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("hook output shapes", () => {
	test("sessionStart emits env + context on attach, empty JSON when daemon unavailable", async () => {
		const out = parseOutput(
			await runHook("session-start-lsp.ts", {
				hook_event_name: "sessionStart",
				conversation_id: "shape-test-1",
				workspace_roots: [process.cwd()],
			}),
		);
		// Fail-open contract: {} when the daemon can't be reached; otherwise the
		// env export + availability context, never a crash shape.
		if (Object.keys(out).length === 0) {
			expect(out).toEqual({});
		} else {
			const env = out.env as Record<string, unknown> | undefined;
			expect(typeof env?.HSTACK_LSP_SOCK).toBe("string");
			expect(typeof out.additional_context).toBe("string");
		}
	}, 20_000);

	test("stop emits empty JSON when nothing pending", async () => {
		const out = parseOutput(
			await runHook("stop-lsp.ts", {
				hook_event_name: "stop",
				conversation_id: "shape-test-no-pending",
				status: "completed",
				loop_count: 0,
			}),
		);
		expect(out).toEqual({});
	}, 20_000);

	test("sessionEnd emits empty JSON", async () => {
		const out = parseOutput(
			await runHook("session-end-lsp.ts", {
				hook_event_name: "sessionEnd",
				conversation_id: "shape-test-1",
				reason: "completed",
			}),
		);
		expect(out).toEqual({});
	}, 20_000);

	test("postToolUse on unknown file emits empty JSON (fail-open)", async () => {
		const out = parseOutput(
			await runHook("post-tool-use-lsp.ts", {
				hook_event_name: "postToolUse",
				conversation_id: "shape-test-2",
				workspace_roots: [process.cwd()],
				tool_name: "Write",
				tool_input: { path: "/tmp/hstack-shape-test.zzz" },
			}),
		);
		// Either empty (no server for .zzz) or a context block; never a crash shape.
		expect(typeof out).toBe("object");
		if ("additional_context" in out) {
			expect(typeof out.additional_context).toBe("string");
		}
	}, 25_000);
});
