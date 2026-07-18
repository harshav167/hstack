/**
 * Hook ↔ daemon wire protocol over the unix socket (NDJSON: one JSON
 * request line in, one JSON response line out). Op set mirrors droid-lsp
 * `internal/socket/protocol.go`, extended for the write-path pipeline.
 */
import type { DiagnosticReport } from "./format.ts";

export const PROTOCOL_VERSION = 1;

export interface AttachRequest {
	readonly op: "attach";
	readonly sessionId: string;
	readonly workspaceRoots: readonly string[];
}

export interface DiagnoseRequest {
	readonly op: "diagnose";
	readonly sessionId: string;
	readonly path: string;
	readonly workspaceRoot: string;
	readonly content: string;
	/** Inline wait budget; servers that miss it move to the pending channel. */
	readonly timeoutMs: number;
}

export interface PeekRequest {
	readonly op: "peek";
	readonly sessionId: string;
	readonly path: string;
	readonly workspaceRoot: string;
}

export interface DrainRequest {
	readonly op: "drain";
	readonly sessionId: string;
}

export interface ForgetRequest {
	readonly op: "forget";
	readonly sessionId: string;
	readonly path: string;
}

export interface ReleaseRequest {
	readonly op: "release";
	readonly sessionId: string;
}

export interface StatusRequest {
	readonly op: "status";
}

export interface ReloadRequest {
	readonly op: "reload";
	readonly workspaceRoot: string;
}

export interface ShutdownRequest {
	readonly op: "shutdown";
}

export type Request =
	| AttachRequest
	| DiagnoseRequest
	| PeekRequest
	| DrainRequest
	| ForgetRequest
	| ReleaseRequest
	| StatusRequest
	| ReloadRequest
	| ShutdownRequest;

export interface PendingReport {
	readonly sessionId: string;
	readonly path: string;
	readonly displayPath: string;
	readonly report: DiagnosticReport;
}

export interface StatusPayload {
	readonly pid: number;
	readonly startedAt: number;
	readonly servers: Array<{
		readonly key: string;
		readonly status: string;
		readonly supervisor: string;
	}>;
	readonly storeEntries: number;
	readonly sessions: readonly string[];
}

export type Response =
	| { readonly ok: true; readonly result: "attached" | "released" | "forgotten" | "reloaded" | "shutting-down" }
	| { readonly ok: true; readonly status: "ready"; readonly report: DiagnosticReport; readonly displayPath: string }
	| { readonly ok: true; readonly status: "pending" | "clean" | "no-server" }
	| { readonly ok: true; readonly pending: readonly PendingReport[] }
	| { readonly ok: true; readonly daemonStatus: StatusPayload }
	| { readonly ok: false; readonly error: string };

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a daemon response line. Untrusted IPC: never trust the shape without parsing. */
export function parseResponse(value: unknown): Response | null {
	if (!isObject(value) || typeof value.ok !== "boolean") return null;
	if (value.ok === false) {
		return typeof value.error === "string" ? { ok: false, error: value.error } : null;
	}
	if (typeof value.result === "string") {
		const results = ["attached", "released", "forgotten", "reloaded", "shutting-down"] as const;
		type OkResult = Extract<Response, { result: unknown }>["result"];
		if ((results as readonly string[]).includes(value.result)) {
			return { ok: true, result: value.result as OkResult };
		}
		return null;
	}
	if (typeof value.status === "string") {
		if (value.status === "ready") {
			if (!isObject(value.report) || !Array.isArray(value.report.messages)) return null;
			return {
				ok: true,
				status: "ready",
				report: value.report as unknown as import("./format.ts").DiagnosticReport,
				displayPath: typeof value.displayPath === "string" ? value.displayPath : "",
			};
		}
		if (value.status === "pending" || value.status === "clean" || value.status === "no-server") {
			return { ok: true, status: value.status };
		}
		return null;
	}
	if (Array.isArray(value.pending)) return { ok: true, pending: value.pending as readonly PendingReport[] };
	if (isObject(value.daemonStatus)) return { ok: true, daemonStatus: value.daemonStatus as unknown as StatusPayload };
	return null;
}

export function parseRequest(value: unknown): Request | null {
	if (!isObject(value) || typeof value.op !== "string") return null;
	switch (value.op) {
		case "attach":
			if (typeof value.sessionId !== "string" || !Array.isArray(value.workspaceRoots)) return null;
			return {
				op: "attach",
				sessionId: value.sessionId,
				workspaceRoots: value.workspaceRoots.filter((r): r is string => typeof r === "string"),
			};
		case "diagnose":
			if (
				typeof value.sessionId !== "string" ||
				typeof value.path !== "string" ||
				typeof value.workspaceRoot !== "string" ||
				typeof value.content !== "string"
			) {
				return null;
			}
			return {
				op: "diagnose",
				sessionId: value.sessionId,
				path: value.path,
				workspaceRoot: value.workspaceRoot,
				content: value.content,
				timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : 800,
			};
		case "peek":
			if (typeof value.sessionId !== "string" || typeof value.path !== "string") return null;
			return {
				op: "peek",
				sessionId: value.sessionId,
				path: value.path,
				workspaceRoot: typeof value.workspaceRoot === "string" ? value.workspaceRoot : "",
			};
		case "drain":
			if (typeof value.sessionId !== "string") return null;
			return { op: "drain", sessionId: value.sessionId };
		case "forget":
			if (typeof value.sessionId !== "string" || typeof value.path !== "string") return null;
			return { op: "forget", sessionId: value.sessionId, path: value.path };
		case "release":
			if (typeof value.sessionId !== "string") return null;
			return { op: "release", sessionId: value.sessionId };
		case "status":
			return { op: "status" };
		case "reload":
			return {
				op: "reload",
				workspaceRoot: typeof value.workspaceRoot === "string" ? value.workspaceRoot : "",
			};
		case "shutdown":
			return { op: "shutdown" };
		default:
			return null;
	}
}
