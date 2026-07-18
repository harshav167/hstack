/**
 * hstack-lspd: ONE global daemon per user. Lifecycle ported from droid-lsp
 * `internal/daemon/daemon.go`: fixed socket + pid lockfile (single instance
 * by construction), router of lazy `serverName:root` sessions, central store,
 * global idle shutdown, health monitor. Request handling is NDJSON-framed;
 * the diagnostics pipeline lives in diagnose.ts.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { acquireInstanceLock, armLifecycleTimers, logLine } from "./daemon-lifecycle.ts";
import { daemonPaths, type DaemonPaths } from "./daemon-paths.ts";
import { diagnose } from "./diagnose.ts";
import {
	dedupeDiagnostics,
	type DiagnosticReport,
	formatDiagnostic,
	formatDiagnosticsSummary,
	limitDiagnosticMessages,
	sortDiagnostics,
} from "./format.ts";
import { DiagnosticsLedger } from "./ledger.ts";
import { applyPolicy, DEFAULT_POLICY, type PolicyConfig } from "./policy.ts";
import { parseRequest, type Request, type Response, type StatusPayload } from "./protocol.ts";
import { Router } from "./router.ts";
import { SessionState } from "./session-state.ts";
import { DiagnosticStore } from "./store.ts";
import { createNdjsonReceiver } from "./transport.ts";
import type { Diagnostic } from "./types.ts";
import { fileToUri } from "./uri.ts";

export { daemonPaths, type DaemonPaths } from "./daemon-paths.ts";
export { canConnect, daemonRequest, ensureDaemon } from "./transport.ts";
export { renderReportText } from "./format.ts";

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface DaemonOptions {
	readonly policy?: PolicyConfig;
	readonly idleTimeoutMs?: number;
}

export class LspDaemon {
	readonly #paths: DaemonPaths;
	readonly #store = new DiagnosticStore();
	readonly #router: Router;
	readonly #policy: PolicyConfig;
	readonly #idleTimeoutMs: number;
	readonly #state = new SessionState();
	#listener: ReturnType<typeof Bun.listen> | null = null;
	#lastActivity = Date.now();
	#startedAt = Date.now();

	constructor(paths: DaemonPaths = daemonPaths(), options: DaemonOptions = {}) {
		this.#paths = paths;
		this.#policy = options.policy ?? DEFAULT_POLICY;
		this.#idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		this.#router = new Router(this.#store, (session, code) => this.#onClientExit(session.key, code));
	}

	touch(): void {
		this.#lastActivity = Date.now();
	}

	start(): void {
		acquireInstanceLock(this.#paths);
		fs.rmSync(this.#paths.socket, { force: true });
		const receivers = new WeakMap<Bun.Socket<unknown>, (chunk: Buffer | Uint8Array) => void>();
		this.#listener = Bun.listen({
			unix: this.#paths.socket,
			socket: {
				open: sock => {
					receivers.set(sock, createNdjsonReceiver(line => void this.#onLine(sock, line)));
				},
				data: (sock, buf) => {
					this.touch();
					receivers.get(sock)?.(buf);
				},
				error: () => {},
			},
		});
		fs.chmodSync(this.#paths.socket, 0o600);
		this.#log("daemon started", { pid: process.pid, socket: this.#paths.socket });
		this.#armLifecycleTimers();
	}

	async shutdown(opts: { exitProcess?: boolean } = {}): Promise<void> {
		this.#log("daemon shutting down");
		try {
			this.#listener?.stop(true);
		} catch {
			// Already stopped.
		}
		await this.#router.shutdownAll();
		fs.rmSync(this.#paths.socket, { force: true });
		fs.rmSync(this.#paths.pid, { force: true });
		if (opts.exitProcess !== false) process.exit(0);
	}

	#armLifecycleTimers(): void {
		armLifecycleTimers({
			paths: this.#paths,
			idleTimeoutMs: this.#idleTimeoutMs,
			lastActivity: () => this.#lastActivity,
			shutdown: () => void this.shutdown(),
			log: (message, fields) => this.#log(message, fields),
		});
		const sweep = setInterval(() => this.#state.evictIdle(), 5 * 60 * 1000);
		sweep.unref();
	}

	async #onLine(sock: Bun.Socket<unknown>, line: string): Promise<void> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			sock.write(`${JSON.stringify({ ok: false, error: "invalid JSON" } satisfies Response)}\n`);
			return;
		}
		const request = parseRequest(parsed);
		if (!request) {
			sock.write(`${JSON.stringify({ ok: false, error: "unknown request" } satisfies Response)}\n`);
			return;
		}
		sock.write(`${JSON.stringify(await this.#handle(request))}\n`);
	}

	async #handle(request: Request): Promise<Response> {
		switch (request.op) {
			case "attach": {
				this.#state.attach(request.sessionId, request.workspaceRoots);
				if (!this.#state.ledgers.has(request.sessionId)) {
					this.#state.ledgers.set(request.sessionId, new DiagnosticsLedger());
				}
				return { ok: true, result: "attached" };
			}
			case "diagnose": {
				this.#state.touch(request.sessionId);
				const routes = await this.#router.resolveAll(request.path, request.workspaceRoot);
				if (routes.inline.length === 0 && routes.deferred.length === 0) {
					return { ok: true, status: "no-server" };
				}
				const outcome = await diagnose(routes, request, {
					policy: this.#policy,
					log: (message, fields) => this.#log(message, fields),
					ledgerReduce: (sessionId, p, report) => this.#ledgerFor(sessionId).reduce(p, report),
					ledgerForget: (sessionId, p) => this.#state.ledgers.get(sessionId)?.forget(p),
					turnBudget: sessionId => this.#state.turnBudget(sessionId, this.#policy.maxPerTurn),
					consumeTurnBudget: (sessionId, count) => this.#state.consumeTurnBudget(sessionId, count),
					pushPending: pending => this.#state.pushPending(pending),
					supersedeDeferred: (sessionId, p) => this.#state.supersedeDeferred(sessionId, p),
				});
				if (outcome.kind === "pending") return { ok: true, status: "pending" };
				if (outcome.kind === "clean") return { ok: true, status: "clean" };
				return { ok: true, status: "ready", report: outcome.report, displayPath: outcome.displayPath };
			}
			case "peek":
				return this.#peek(request);
			case "drain":
				return { ok: true, pending: this.#state.drain(request.sessionId) };
			case "forget": {
				this.#state.ledgers.get(request.sessionId)?.forget(request.path);
				return { ok: true, result: "forgotten" };
			}
			case "release": {
				this.#state.release(request.sessionId);
				return { ok: true, result: "released" };
			}
			case "status":
				return { ok: true, daemonStatus: this.#status() };
			case "reload": {
				await this.#router.reload(request.workspaceRoot || process.cwd());
				return { ok: true, result: "reloaded" };
			}
			case "shutdown": {
				setTimeout(() => void this.shutdown(), 50).unref();
				return { ok: true, result: "shutting-down" };
			}
			default: {
				const neverRequest: never = request;
				return { ok: false, error: `unhandled op ${JSON.stringify(neverRequest)}` };
			}
		}
	}

	async #peek(request: Extract<Request, { op: "peek" }>): Promise<Response> {
		const entries = this.#store.peekAll(fileToUri(request.path));
		if (entries.length === 0) return { ok: true, status: "clean" };
		const all: Diagnostic[] = entries.flatMap(entry => [...entry.diagnostics]);
		const unique = sortDiagnostics(dedupeDiagnostics(applyPolicy(all, this.#policy)));
		if (unique.length === 0) return { ok: true, status: "clean" };
		// Fall back to the session's attached root when the request omits one.
		const root = request.workspaceRoot || this.#state.roots.get(request.sessionId)?.[0] || "";
		const displayPath = root ? path.relative(root, request.path) : request.path;
		const messages = limitDiagnosticMessages(unique.map(d => formatDiagnostic(d, displayPath || request.path)));
		const report: DiagnosticReport = {
			server: [...new Set(entries.map(e => e.serverName))].join(", "),
			messages,
			summary: formatDiagnosticsSummary(unique),
			errored: unique.some(d => (d.severity ?? 1) === 1),
		};
		// Dedup against the session ledger like diagnose does, so Read stops
		// re-injecting errors the agent has already seen.
		const deduped = this.#ledgerFor(request.sessionId).reduce(request.path, report);
		if (deduped.messages.length === 0) return { ok: true, status: "clean" };
		return { ok: true, status: "ready", report: deduped, displayPath: displayPath || request.path };
	}

	#ledgerFor(sessionId: string): DiagnosticsLedger {
		let ledger = this.#state.ledgers.get(sessionId);
		if (!ledger) {
			ledger = new DiagnosticsLedger();
			this.#state.ledgers.set(sessionId, ledger);
		}
		return ledger;
	}

	#onClientExit(key: string, code: number): void {
		this.#log("server exited", { server: key, code });
		const hadSession = this.#router.sessions().some(s => s.key === key);
		this.#router.remove(key);
		// A crashed server leaves its published diagnostics behind; clear them
		// so peek/status stop reporting stale errors from a dead process.
		this.#store.removeSession(key);
		// Record the failure only for sessions that actually ran. The boot-failure
		// path (initialize threw before the session registered) already records via
		// the router's start catch, so counting here too would double-charge the budget.
		if (hadSession) this.#router.supervisorFor(key)?.recordFailure();
	}

	#status(): StatusPayload {
		return {
			pid: process.pid,
			startedAt: this.#startedAt,
			servers: this.#router.sessions().map(session => ({
				key: session.key,
				status: session.client.status,
				supervisor: this.#router.supervisorFor(session.key)?.state ?? "healthy",
			})),
			storeEntries: this.#store.snapshot().length,
			sessions: [...this.#state.sessions],
		};
	}

	#log(message: string, fields?: Record<string, unknown>): void {
		logLine(this.#paths, message, fields);
	}
}
