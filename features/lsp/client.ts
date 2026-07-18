/**
 * Lean stdio LSP client: spawn, initialize, document sync, diagnostics
 * collection. Mirrors omp `lsp/client.ts` semantics (didOpen/didChange with
 * full-document sync, didSave, publishDiagnostics with version tracking),
 * minus everything the diagnostics pipeline doesn't use.
 */
import * as path from "node:path";
import { buildInitializeParams, parsePublishDiagnosticsParams, parsePullDiagnosticItems } from "./client-diagnostics.ts";
import { encodeFrame, findHeaderEnd } from "./framing.ts";
import type { DiagnosticStore } from "./store.ts";
import {
	type Diagnostic,
	isJsonRpcNotification,
	isJsonRpcRequest,
	isJsonRpcResponse,
	isObject,
	type JsonRpcId,
	type JsonRpcMessage,
	parseJsonRpcMessage,
	type ServerConfig,
} from "./types.ts";
import { fileToUri, languageIdForPath } from "./uri.ts";

export interface OpenFile {
	version: number;
	languageId: string;
}

export type ClientStatus = "connecting" | "ready" | "error";

interface PendingRequest {
	readonly method: string;
	readonly resolve: (result: unknown) => void;
	readonly reject: (error: Error) => void;
}

export class LspClient {
	readonly name: string;
	readonly root: string;
	readonly config: ServerConfig;
	/** Store slot identity: `name:root` — matches the router session key so removals stay root-scoped. */
	readonly sessionKey: string;
	readonly openFiles = new Map<string, OpenFile>();
	readonly diagnostics = new Map<string, readonly Diagnostic[]>();
	readonly documentVersions = new Map<string, number | null>();

	/** Bumps on every publishDiagnostics (or pull) from this server — the freshness baseline. */
	diagnosticsVersion = 0;
	status: ClientStatus = "connecting";

	#proc: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
	#requestId = 0;
	#pending = new Map<JsonRpcId, PendingRequest>();
	#buffer = new Uint8Array(0);
	#store: DiagnosticStore;
	#exitCallbacks: Array<(code: number) => void> = [];
	#writeQueue: Promise<void> = Promise.resolve();

	constructor(name: string, config: ServerConfig, root: string, store: DiagnosticStore) {
		this.name = name;
		this.config = config;
		this.root = root;
		this.sessionKey = `${name}:${root}`;
		this.#store = store;
	}

	get pid(): number | null {
		return this.#proc?.pid ?? null;
	}

	onExit(callback: (code: number) => void): void {
		this.#exitCallbacks.push(callback);
	}

	async start(timeoutMs = 20_000): Promise<void> {
		const command = this.config.resolvedCommand ?? this.config.command;
		const proc = Bun.spawn([command, ...(this.config.args ?? [])], {
			cwd: this.root,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		this.#proc = proc;
		proc.exited.then(code => {
			this.status = "error";
			for (const [, pending] of this.#pending) {
				pending.reject(new Error(`${this.name} exited with code ${code}`));
			}
			this.#pending.clear();
			for (const cb of this.#exitCallbacks) cb(code);
		});
		void this.#readLoop(proc.stdout as ReadableStream<Uint8Array>);
		// Drain stderr: servers like gopls/semgrep log verbosely, and a full pipe
		// buffer blocks the child's stdout dispatch loop (diagnostics stop arriving).
		void this.#drain(proc.stderr as ReadableStream<Uint8Array>);

		try {
			await this.#requestWithTimeout("initialize", buildInitializeParams(this.config, this.root), timeoutMs);
			this.#notify("initialized", {});
			if (this.config.settings) {
				this.#notify("workspace/didChangeConfiguration", { settings: this.config.settings });
			}
			this.status = "ready";
		} catch (error) {
			// A failed initialize must not leak the child — the router's
			// fallback spawns a second binary and this one would linger.
			proc.kill();
			await proc.exited.catch(() => {});
			this.#proc = null;
			for (const [, pending] of this.#pending) {
				pending.reject(error instanceof Error ? error : new Error(String(error)));
			}
			this.#pending.clear();
			throw error;
		}
	}

	#notify(method: string, params: unknown): void {
		this.#enqueue({ jsonrpc: "2.0", method, params });
	}

	#requestWithTimeout(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
		if (!this.#proc) return Promise.reject(new Error(`${this.name} not started`));
		const id = ++this.#requestId;
		const { promise, resolve, reject } = Promise.withResolvers<unknown>();
		this.#pending.set(id, { method, resolve, reject });
		const timer = setTimeout(() => {
			if (this.#pending.delete(id)) {
				reject(new Error(`${this.name} ${method} timed out after ${timeoutMs}ms`));
			}
		}, timeoutMs);
		promise.finally(() => clearTimeout(timer)).catch(() => {});
		this.#enqueue({ jsonrpc: "2.0", id, method, params });
		return promise;
	}

	/** Serialized writes — concurrent writers must not interleave frames. */
	#enqueue(message: JsonRpcMessage): void {
		const payload = encodeFrame(message);
		const run = () => {
			this.#proc?.stdin.write(payload);
			this.#proc?.stdin.flush();
		};
		this.#writeQueue = this.#writeQueue.then(run, run).catch(() => {});
	}

	async #readLoop(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) this.#feed(value);
			}
		} catch {
			// Stream died; the exit handler covers state.
		}
	}

	/** Consume a stream to EOF and discard it. Prevents pipe-buffer backpressure. */
	async #drain(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
		try {
			while (!(await reader.read()).done) {
				// Discard.
			}
		} catch {
			// Stream died; nothing to drain.
		}
	}

	#feed(chunk: Uint8Array): void {
		const merged = new Uint8Array(this.#buffer.length + chunk.length);
		merged.set(this.#buffer, 0);
		merged.set(chunk, this.#buffer.length);
		this.#buffer = merged;

		while (true) {
			const headerEnd = findHeaderEnd(this.#buffer);
			if (headerEnd === -1) return;
			const header = new TextDecoder().decode(this.#buffer.subarray(0, headerEnd));
			const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
			if (!lengthMatch) {
				this.#buffer = this.#buffer.subarray(headerEnd + 4);
				continue;
			}
			const contentLength = Number.parseInt(lengthMatch[1], 10);
			const frameEnd = headerEnd + 4 + contentLength;
			if (this.#buffer.length < frameEnd) return;
			const body = this.#buffer.subarray(headerEnd + 4, frameEnd);
			this.#buffer = this.#buffer.subarray(frameEnd);
			try {
				const message = parseJsonRpcMessage(JSON.parse(new TextDecoder().decode(body)));
				if (message) this.#dispatch(message);
			} catch {
				// Malformed frame; skip it.
			}
		}
	}

	#dispatch(message: JsonRpcMessage): void {
		// Server→client request: answer the ones we know, null the rest —
		// tsgo blocks its dispatch loop until refresh requests get a response.
		if (isJsonRpcRequest(message)) {
			let result: unknown = null;
			if (message.method === "workspace/workspaceFolders") {
				result = [{ uri: fileToUri(this.root), name: path.basename(this.root) }];
			} else if (message.method === "workspace/configuration") {
				const itemCount =
					isObject(message.params) && Array.isArray(message.params.items) ? message.params.items.length : 0;
				result = Array.from({ length: itemCount }, () => this.config.settings ?? {});
			}
			this.#enqueue({ jsonrpc: "2.0", id: message.id, result });
			return;
		}
		if (isJsonRpcNotification(message)) {
			if (message.method === "textDocument/publishDiagnostics") {
				const params = parsePublishDiagnosticsParams(message.params);
				if (params) this.#acceptDiagnostics(params.uri, params.diagnostics, params.version);
			}
			return;
		}
		if (isJsonRpcResponse(message)) {
			const id = message.id;
			if (id === null || id === undefined) return;
			const pending = this.#pending.get(id);
			if (!pending) return;
			this.#pending.delete(id);
			if (message.error) {
				pending.reject(new Error(`${this.name} ${pending.method}: ${message.error.message}`));
			} else {
				pending.resolve(message.result);
			}
		}
	}

	#acceptDiagnostics(uri: string, diagnostics: readonly Diagnostic[], version: number | null): void {
		this.diagnostics.set(uri, diagnostics);
		this.documentVersions.set(uri, version);
		this.diagnosticsVersion += 1;
		this.#store.publish(this.sessionKey, this.name, uri, diagnostics, version);
	}

	/** Open a file if needed, then push full content. Mirrors omp `syncContent`. */
	async syncContent(filePath: string, content: string): Promise<number> {
		const uri = fileToUri(filePath);
		const existing = this.openFiles.get(uri);
		if (!existing) {
			const version = 1;
			const languageId = languageIdForPath(filePath);
			this.openFiles.set(uri, { version, languageId });
			this.#notify("textDocument/didOpen", {
				textDocument: { uri, languageId, version, text: content },
			});
			return version;
		}
		const version = existing.version + 1;
		this.openFiles.set(uri, { ...existing, version });
		this.#notify("textDocument/didChange", {
			textDocument: { uri, version },
			contentChanges: [{ text: content }],
		});
		return version;
	}

	notifySaved(filePath: string): void {
		const uri = fileToUri(filePath);
		if (!this.openFiles.has(uri)) return;
		this.#notify("textDocument/didSave", { textDocument: { uri } });
	}

	/**
	 * LSP 3.17 pull diagnostics. Pull-model servers (tsgo v7) never publish;
	 * this is the only way to get anything out of them. The result lands in
	 * the same state push diagnostics use, so peek/store paths stay uniform.
	 */
	async pullDiagnostics(uri: string, timeoutMs: number): Promise<readonly Diagnostic[]> {
		const raw: unknown = await this.#requestWithTimeout("textDocument/diagnostic", { textDocument: { uri } }, timeoutMs);
		const items = parsePullDiagnosticItems(raw);
		this.#acceptDiagnostics(uri, items, this.openFiles.get(uri)?.version ?? null);
		return items;
	}

	async shutdown(): Promise<void> {
		for (const uri of [...this.openFiles.keys()]) {
			this.#notify("textDocument/didClose", { textDocument: { uri } });
		}
		this.openFiles.clear();
		try {
			await this.#requestWithTimeout("shutdown", null, 3_000);
		} catch {
			// Server may already be gone.
		}
		this.#notify("exit", null);
		this.#proc?.kill();
		this.#proc = null;
		this.#store.removeSession(this.sessionKey);
	}
}
