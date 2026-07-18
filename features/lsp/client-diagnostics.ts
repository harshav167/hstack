/**
 * Client wire payloads: diagnostic parsing plus the initialize params builder.
 * Splits message-shape code out of client.ts so the client owns spawn/sync only.
 */
import * as path from "node:path";
import { isObject, type Diagnostic, type ServerConfig } from "./types.ts";
import { fileToUri } from "./uri.ts";

function parseRange(value: unknown): Diagnostic["range"] | null {
	if (!isObject(value) || !isObject(value.start) || !isObject(value.end)) return null;
	const { start, end } = value;
	if (
		typeof start.line !== "number" ||
		typeof start.character !== "number" ||
		typeof end.line !== "number" ||
		typeof end.character !== "number"
	) {
		return null;
	}
	return {
		start: { line: start.line, character: start.character },
		end: { line: end.line, character: end.character },
	};
}

function parseDiagnostic(value: unknown): Diagnostic | null {
	if (!isObject(value) || typeof value.message !== "string") return null;
	const range = parseRange(value.range);
	if (!range) return null;
	const severity =
		value.severity === 1 || value.severity === 2 || value.severity === 3 || value.severity === 4
			? value.severity
			: undefined;
	const code = typeof value.code === "string" || typeof value.code === "number" ? value.code : undefined;
	const source = typeof value.source === "string" ? value.source : undefined;
	return {
		range,
		message: value.message,
		...(severity ? { severity } : {}),
		...(code !== undefined ? { code } : {}),
		...(source ? { source } : {}),
	};
}

export function parsePublishDiagnosticsParams(
	value: unknown,
): { uri: string; diagnostics: Diagnostic[]; version: number | null } | null {
	if (!isObject(value) || typeof value.uri !== "string") return null;
	const diagnostics = Array.isArray(value.diagnostics)
		? value.diagnostics.map(parseDiagnostic).filter((d): d is Diagnostic => d !== null)
		: [];
	return {
		uri: value.uri,
		diagnostics,
		version: typeof value.version === "number" ? value.version : null,
	};
}

export function parsePullDiagnosticItems(value: unknown): Diagnostic[] {
	if (!isObject(value) || value.kind !== "full" || !Array.isArray(value.items)) return [];
	return value.items.map(parseDiagnostic).filter((d): d is Diagnostic => d !== null);
}

export function buildInitializeParams(config: ServerConfig, root: string): Record<string, unknown> {
	const rootUri = fileToUri(root);
	return {
		processId: process.pid,
		rootUri,
		rootPath: root,
		workspaceFolders: [{ uri: rootUri, name: path.basename(root) }],
		capabilities: {
			textDocument: {
				synchronization: { didSave: true, dynamicRegistration: false },
				publishDiagnostics: { relatedInformation: false, versionSupport: true },
				// Declared only for pull-model servers: some push servers
				// (ruff) stop publishing when the client advertises pull support.
				...(config.pullDiagnostics ? { diagnostic: { dynamicRegistration: false } } : {}),
			},
			workspace: { workspaceFolders: true },
		},
		initializationOptions: config.initOptions ?? {},
		clientInfo: { name: "hstack-lspd", version: "0.1.0" },
	};
}
