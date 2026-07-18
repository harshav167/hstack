/**
 * LSP protocol types, trimmed to what the diagnostics pipeline speaks.
 * Shape mirrors omp `packages/coding-agent/src/lsp/types.ts`.
 */

export interface Position {
	readonly line: number;
	readonly character: number;
}

export interface Range {
	readonly start: Position;
	readonly end: Position;
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4;

export interface Diagnostic {
	readonly range: Range;
	readonly severity?: DiagnosticSeverity;
	readonly code?: string | number;
	readonly source?: string;
	readonly message: string;
}

export interface PublishedDiagnostics {
	readonly diagnostics: readonly Diagnostic[];
	readonly version: number | null;
}

export interface PublishDiagnosticsParams {
	readonly uri: string;
	readonly diagnostics: readonly Diagnostic[];
	readonly version?: number | null;
}

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
	readonly jsonrpc: "2.0";
	readonly id: JsonRpcId;
	readonly method: string;
	readonly params?: unknown;
}

export interface JsonRpcResponse {
	readonly jsonrpc: "2.0";
	readonly id?: JsonRpcId | null;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export interface JsonRpcNotification {
	readonly jsonrpc: "2.0";
	readonly method: string;
	readonly params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/** One language server entry from an lsp.json-style config. Mirrors omp `ServerConfig`. */
export interface ServerConfig {
	readonly command: string;
	readonly args?: readonly string[];
	readonly fileTypes: readonly string[];
	readonly rootMarkers: readonly string[];
	readonly initOptions?: Record<string, unknown>;
	readonly settings?: Record<string, unknown>;
	readonly disabled?: boolean;
	readonly isLinter?: boolean;
	/** Slow servers (semgrep/snyk) never block the inline window; results land via the pending channel. */
	readonly defer?: boolean;
	/**
	 * Pull-model servers (LSP 3.17 `textDocument/diagnostic`) never push
	 * `publishDiagnostics` — tsgo v7 is one (microsoft/typescript-go#3615
	 * family). Diagnostics for these are requested, not awaited.
	 */
	readonly pullDiagnostics?: boolean;
	/** Resolved absolute path to the command binary, set during config load. */
	readonly resolvedCommand?: string;
}

export interface LspConfig {
	readonly servers: Record<string, ServerConfig>;
	readonly idleTimeoutMs?: number;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonRpcRequest(message: JsonRpcMessage): message is JsonRpcRequest {
	return "method" in message && "id" in message;
}

export function isJsonRpcResponse(message: JsonRpcMessage): message is JsonRpcResponse {
	return !("method" in message);
}

export function isJsonRpcNotification(message: JsonRpcMessage): message is JsonRpcNotification {
	return "method" in message && !("id" in message);
}

/**
 * Runtime guard for an untrusted JSON-RPC frame off the wire. The client must
 * not cast raw parsed JSON to JsonRpcMessage; malformed frames are dropped.
 */
export function parseJsonRpcMessage(value: unknown): JsonRpcMessage | null {
	if (!isObject(value) || value.jsonrpc !== "2.0") return null;
	const hasMethod = typeof value.method === "string";
	const hasId = typeof value.id === "number" || typeof value.id === "string";
	if (hasMethod && hasId) {
		return { jsonrpc: "2.0", id: value.id as JsonRpcId, method: value.method as string, params: value.params };
	}
	if (hasMethod) {
		return { jsonrpc: "2.0", method: value.method as string, params: value.params };
	}
	// Response: id (possibly null) plus result or error.
	if ("id" in value || "result" in value || "error" in value) {
		const out: { -readonly [K in keyof JsonRpcResponse]?: JsonRpcResponse[K] } = { jsonrpc: "2.0" };
		if (typeof value.id === "number" || typeof value.id === "string") out.id = value.id;
		else if (value.id === null) out.id = null;
		if ("result" in value) out.result = value.result;
		if (isObject(value.error) && typeof value.error.code === "number" && typeof value.error.message === "string") {
			out.error = { code: value.error.code, message: value.error.message, data: value.error.data };
		}
		return out as JsonRpcResponse;
	}
	return null;
}
