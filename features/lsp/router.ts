/**
 * Router: file path → server session, keyed `serverName:root`, spawned lazily.
 * Ported from droid-lsp `internal/lsp/router` + `rootdetect`. One router per
 * daemon serves every project and language. Deferred-flagged servers start
 * off the inline path so a slow scanner boot never eats the write budget.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getServersForFile, hasRootMarkers, loadServerConfig } from "./config.ts";
import { LspClient } from "./client.ts";
import type { DiagnosticStore } from "./store.ts";
import { Supervisor } from "./supervisor.ts";
import type { LspConfig, ServerConfig } from "./types.ts";

/** How long an inline spawn waits for a supervisor's restart backoff before giving up. */
const RESTART_WAIT_CAP_MS = 5_000;

export function detectRoot(filePath: string, markers: readonly string[], fallbackRoot: string): string {
	// "." matches every directory (existsSync(dir/.) is always true), so a
	// dot-only marker set means "the workspace root is the project" — nested
	// folders must not each get their own server session.
	if (markers.length > 0 && markers.every(m => m === ".")) return fallbackRoot;
	let dir = path.dirname(path.resolve(filePath));
	while (true) {
		if (hasRootMarkers(dir, markers.filter(m => m !== "."))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return fallbackRoot;
		dir = parent;
	}
}

export interface ServerSession {
	readonly key: string;
	readonly name: string;
	readonly root: string;
	readonly client: LspClient;
}

export interface RouteResult {
	readonly session: ServerSession;
	readonly config: ServerConfig;
}

export interface DeferredRoute {
	readonly name: string;
	readonly config: ServerConfig;
	/** Resolves once the server is ready (or failed). Sync/wait belong after this. */
	readonly ready: Promise<ServerSession | null>;
}

interface ConfigCacheEntry {
	readonly config: LspConfig;
	readonly mtimeMs: number;
}

export class Router {
	#sessions = new Map<string, ServerSession>();
	#starting = new Map<string, Promise<ServerSession | null>>();
	#supervisors = new Map<string, Supervisor>();
	#configs = new Map<string, ConfigCacheEntry>();
	#store: DiagnosticStore;
	#onClientExit: (session: ServerSession, code: number) => void;

	constructor(store: DiagnosticStore, onClientExit: (session: ServerSession, code: number) => void) {
		this.#store = store;
		this.#onClientExit = onClientExit;
	}

	/** Load config for a root, re-reading when the on-disk files changed (hot reload). */
	configFor(root: string): LspConfig {
		const watchPaths = [
			path.join(root, "lsp.json"),
			path.join(root, ".lsp.json"),
			path.join(process.env.HOME ?? "", ".hstack", "lsp.json"),
		];
		let newest = 0;
		for (const watchPath of watchPaths) {
			try {
				const mtime = fs.statSync(watchPath).mtimeMs;
				if (mtime > newest) newest = mtime;
			} catch {
				// Missing file is fine.
			}
		}
		const cached = this.#configs.get(root);
		if (cached && cached.mtimeMs === newest) return cached.config;
		const config = loadServerConfig(root);
		this.#configs.set(root, { config, mtimeMs: newest });
		return config;
	}

	/**
	 * Classify matches before any spawn. Inline servers start synchronously;
	 * deferred ones boot in the background behind `ready`.
	 */
	async resolveAll(filePath: string, workspaceRoot: string): Promise<{ inline: RouteResult[]; deferred: DeferredRoute[] }> {
		const config = this.configFor(workspaceRoot);
		const matches = getServersForFile(config, filePath);
		const inline: RouteResult[] = [];
		const deferred: DeferredRoute[] = [];
		for (const [name, serverConfig] of matches) {
			const root = detectRoot(filePath, serverConfig.rootMarkers, workspaceRoot);
			if (serverConfig.defer) {
				deferred.push({ name, config: serverConfig, ready: this.#ensureSession(name, serverConfig, root) });
			} else {
				const session = await this.#ensureSession(name, serverConfig, root);
				if (session) inline.push({ session, config: serverConfig });
			}
		}
		return { inline, deferred };
	}

	#ensureSession(name: string, serverConfig: ServerConfig, root: string): Promise<ServerSession | null> {
		const key = `${name}:${root}`;
		const existing = this.#sessions.get(key);
		if (existing && existing.client.status !== "error") return Promise.resolve(existing);

		const inflight = this.#starting.get(key);
		if (inflight) return inflight;

		const startPromise = this.#start(name, serverConfig, root, key).finally(() => {
			this.#starting.delete(key);
		});
		this.#starting.set(key, startPromise);
		return startPromise;
	}

	async #start(name: string, serverConfig: ServerConfig, root: string, key: string): Promise<ServerSession | null> {
		const supervisor = this.#supervisors.get(key) ?? new Supervisor();
		this.#supervisors.set(key, supervisor);
		if (supervisor.state === "degraded") return null;
		const waitMs = supervisor.nextAttemptAt - Date.now();
		if (waitMs > 0) {
			if (waitMs > RESTART_WAIT_CAP_MS) return null;
			await Bun.sleep(waitMs);
		}
		try {
			return await this.#spawn(name, serverConfig, root, key, supervisor);
		} catch {
			// A project-local binary shadowing the command may be broken (e.g.
			// node_modules/.bin/tsc v5 without --lsp). Fall back to the PATH
			// resolution once before declaring failure.
			const pathResolved = Bun.which(serverConfig.command);
			if (pathResolved && pathResolved !== serverConfig.resolvedCommand) {
				try {
					return await this.#spawn(name, { ...serverConfig, resolvedCommand: pathResolved }, root, key, supervisor);
				} catch {
					// Both resolutions failed.
				}
			}
			supervisor.recordFailure();
			return null;
		}
	}

	async #spawn(
		name: string,
		serverConfig: ServerConfig,
		root: string,
		key: string,
		supervisor: Supervisor,
	): Promise<ServerSession> {
		const client = new LspClient(name, serverConfig, root, this.#store);
		const session: ServerSession = { key, name, root, client };
		client.onExit(code => this.#onClientExit(session, code));
		await client.start();
		supervisor.recordHealthy();
		this.#sessions.set(key, session);
		return session;
	}

	remove(key: string): void {
		this.#sessions.delete(key);
	}

	/** Effective-config fields that require a respawn when they change on reload. */
	static #configFingerprint(config: ServerConfig): string {
		return JSON.stringify({
			command: config.command,
			resolvedCommand: config.resolvedCommand,
			args: config.args,
			settings: config.settings,
			initOptions: config.initOptions,
			disabled: config.disabled ?? false,
		});
	}

	/**
	 * Re-read config for `root` and reconcile live sessions: respawn servers
	 * whose effective config changed, drop ones that became disabled or lost
	 * their binary. Unchanged sessions stay warm.
	 */
	async reload(root: string): Promise<void> {
		const fresh = this.configFor(root);
		const sessions = [...this.#sessions.values()];
		for (const session of sessions) {
			if (session.root !== root) continue;
			const freshConfig = fresh.servers[session.name];
			const changed =
				!freshConfig || Router.#configFingerprint(freshConfig) !== Router.#configFingerprint(session.client.config);
			if (!changed) continue;
			this.#sessions.delete(session.key);
			await session.client.shutdown().catch(() => {});
			this.#store.removeSession(session.key);
			if (freshConfig && !freshConfig.disabled) {
				await this.#ensureSession(session.name, freshConfig, session.root);
			}
		}
		this.resetSupervisors();
	}

	supervisorFor(key: string): Supervisor | undefined {
		return this.#supervisors.get(key);
	}

	resetSupervisors(): void {
		for (const supervisor of this.#supervisors.values()) supervisor.reset();
	}

	sessions(): ServerSession[] {
		return [...this.#sessions.values()];
	}

	async shutdownAll(): Promise<void> {
		const sessions = [...this.#sessions.values()];
		this.#sessions.clear();
		await Promise.allSettled(sessions.map(session => session.client.shutdown()));
	}
}
