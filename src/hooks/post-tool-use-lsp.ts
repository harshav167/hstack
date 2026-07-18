/**
 * postToolUse hook: diagnostics after every Write/StrReplace/Edit/ApplyPatch
 * (fresh wait, inline budget) and after every Read (store peek only).
 * Fail-open: a dead daemon emits nothing.
 */
import * as fs from "node:fs";
import { readHookInput } from "../shared/hooks/hook-io.ts";
import {
	callDaemon,
	changedPathsOf,
	lspConfig,
	reportToContext,
	sessionIdOf,
	toolNameOf,
	workspaceRootOf,
} from "../../features/lsp/hook-client.ts";
import type { Response } from "../../features/lsp/protocol.ts";

const input = await readHookInput();
const config = await lspConfig();

interface PostToolUseOutput {
	additional_context?: string;
}

function emit(output: PostToolUseOutput): void {
	process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (!config.enabled) {
	emit({});
	process.exit(0);
}

const toolName = toolNameOf(input);
const sessionId = sessionIdOf(input);
const root = workspaceRootOf(input);
const changedPaths = changedPathsOf(input);

if (changedPaths.length === 0) {
	emit({});
	process.exit(0);
}

const WRITE_TOOLS = new Set(["Write", "StrReplace", "Edit", "ApplyPatch", "MultiEdit"]);

function readyContext(response: Response | null, fallbackPath: string): string | null {
	if (!response || !("status" in response)) return null;
	if (response.status === "ready" && response.report) {
		return reportToContext(response.report, response.displayPath ?? fallbackPath);
	}
	if (response.status === "pending") {
		return `<system-notice>LSP diagnostics for ${fallbackPath} are still computing (slow server); they will arrive as a late notice if any issues are found.</system-notice>`;
	}
	return null;
}

if (toolName === "Read") {
	const response = await callDaemon({ op: "peek", sessionId, path: changedPaths[0], workspaceRoot: root });
	const context = readyContext(response, changedPaths[0]);
	emit(context ? { additional_context: context } : {});
	process.exit(0);
}

if (!WRITE_TOOLS.has(toolName)) {
	emit({});
	process.exit(0);
}

const contexts: string[] = [];
for (const filePath of changedPaths) {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf8");
	} catch {
		continue;
	}
	const response = await callDaemon(
		{ op: "diagnose", sessionId, path: filePath, workspaceRoot: root, content, timeoutMs: config.inlineTimeoutMs },
		config.inlineTimeoutMs + 3_000,
	);
	const context = readyContext(response, filePath);
	if (context) contexts.push(context);
}

emit(contexts.length > 0 ? { additional_context: contexts.join("\n\n") } : {});
