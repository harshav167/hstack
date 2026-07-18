/**
 * Shared hook-side client for the LSP daemon: ensure it runs, one NDJSON
 * round-trip, plus hook input extraction helpers. Fail-open everywhere — a
 * broken daemon must never block a tool call.
 */
import * as path from "node:path";
import { daemonPaths } from "../../features/lsp/daemon-paths.ts";
import { renderReportText } from "../../features/lsp/format.ts";
import type { Request, Response } from "../../features/lsp/protocol.ts";
import { daemonRequest, ensureDaemon } from "../../features/lsp/transport.ts";
import { loadConfigAsync } from "../../src/shared/config/load.ts";

export interface LspFeatureConfig {
	readonly enabled: boolean;
	readonly inlineTimeoutMs: number;
}

export async function lspConfig(): Promise<LspFeatureConfig> {
	const config = await loadConfigAsync();
	const raw = config.lsp;
	return {
		// Opt-in: the feature spawns language servers, so it ships disabled and
		// turns on via ~/.hstack/config.json { "lsp": { "enabled": true } }.
		enabled: raw?.enabled ?? false,
		inlineTimeoutMs: typeof raw?.inlineTimeoutMs === "number" ? raw.inlineTimeoutMs : 800,
	};
}

export async function callDaemon(request: Request, timeoutMs = 4_000): Promise<Response | null> {
	try {
		if (!(await ensureDaemon(daemonPaths()))) return null;
		return await daemonRequest(request, timeoutMs);
	} catch {
		return null;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toolNameOf(input: unknown): string {
	if (!isObject(input)) return "";
	return typeof input.tool_name === "string" ? input.tool_name : "";
}

export function sessionIdOf(input: unknown): string {
	if (!isObject(input)) return "unknown";
	if (typeof input.conversation_id === "string") return input.conversation_id;
	if (typeof input.session_id === "string") return input.session_id;
	return "unknown";
}

export function workspaceRootOf(input: unknown): string {
	if (isObject(input)) {
		const roots = input.workspace_roots;
		if (Array.isArray(roots) && typeof roots[0] === "string") return roots[0];
	}
	return process.env.CURSOR_PROJECT_DIR ?? process.cwd();
}

/** ApplyPatch carries patch text, not a path — pull every touched file from its headers. */
const PATCH_FILE_HEADER_RE = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;

function applyPatchPaths(input: unknown): string[] {
	if (!isObject(input) || !isObject(input.tool_input)) return [];
	const toolInput = input.tool_input;
	const patch = typeof toolInput.patch === "string" ? toolInput.patch : typeof toolInput.input === "string" ? toolInput.input : "";
	if (!patch) return [];
	const paths: string[] = [];
	for (const match of patch.matchAll(PATCH_FILE_HEADER_RE)) {
		if (match[1]) paths.push(match[1].trim());
	}
	return paths;
}

/** Every absolute file path this tool call touched (usually one; several for ApplyPatch / MultiEdit). */
export function changedPathsOf(input: unknown): string[] {
	const root = workspaceRootOf(input);
	const toAbsolute = (p: string) => (path.isAbsolute(p) ? p : path.resolve(root, p));
	if (!isObject(input)) return [];
	const toolInput = isObject(input.tool_input) ? input.tool_input : {};
	const direct = toolInput.path ?? toolInput.file_path;
	if (typeof direct === "string") return [toAbsolute(direct)];
	// MultiEdit variants carry per-edit file fields; ApplyPatch carries patch text.
	if (Array.isArray(toolInput.edits)) {
		const paths = new Set<string>();
		for (const edit of toolInput.edits) {
			if (!isObject(edit)) continue;
			const target = edit.file_path ?? edit.path ?? edit.target_file;
			if (typeof target === "string") paths.add(toAbsolute(target));
		}
		if (paths.size > 0) return [...paths];
	}
	return applyPatchPaths(input).map(toAbsolute);
}

export function reportToContext(report: NonNullable<Extract<Response, { status: "ready" }>["report"]>, displayPath: string): string {
	return renderReportText(report, displayPath);
}
