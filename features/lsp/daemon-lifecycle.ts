/**
 * Daemon process lifecycle: instance lock, runtime-dir permissions, idle
 * shutdown timer, socket health monitor. Split from daemon.ts so the request
 * handlers stay the focus of that file.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { DaemonPaths } from "./daemon-paths.ts";

const HEALTH_INTERVAL_MS = 30_000;
const HEALTH_FAIL_LIMIT = 3;

/** Write pidfile only after we own the socket; refuse to double-start. */
export function acquireInstanceLock(paths: DaemonPaths): void {
	fs.mkdirSync(path.dirname(paths.pid), { recursive: true, mode: 0o700 });
	// mkdir's mode only applies on creation; pre-existing dirs keep their
	// umask perms, so tighten explicitly (the socket is a control channel).
	fs.chmodSync(path.dirname(paths.pid), 0o700);
	if (fs.existsSync(paths.pid)) {
		const raw = fs.readFileSync(paths.pid, "utf8").trim();
		const pid = Number.parseInt(raw, 10);
		if (Number.isFinite(pid)) {
			try {
				process.kill(pid, 0);
				throw new Error(`another hstack-lspd is already running (pid ${pid})`);
			} catch (err) {
				if (err instanceof Error && err.message.includes("already running")) throw err;
				// Stale pidfile from a dead process — take over.
			}
		}
	}
	fs.writeFileSync(paths.pid, String(process.pid), { mode: 0o600 });
}

export function logLine(paths: DaemonPaths, message: string, fields?: Record<string, unknown>): void {
	try {
		const line = JSON.stringify({ ts: new Date().toISOString(), msg: message, ...fields });
		fs.mkdirSync(path.dirname(paths.log), { recursive: true });
		fs.appendFileSync(paths.log, `${line}\n`);
	} catch {
		// Logging must never crash the daemon.
	}
}

/** Idle shutdown + socket health monitor. All timers unref'd; signals trigger shutdown. */
export function armLifecycleTimers(args: {
	readonly paths: DaemonPaths;
	readonly idleTimeoutMs: number;
	readonly lastActivity: () => number;
	readonly shutdown: () => void;
	readonly log: (message: string, fields?: Record<string, unknown>) => void;
}): void {
	const idleTimer = setInterval(() => {
		if (Date.now() - args.lastActivity() >= args.idleTimeoutMs) {
			args.log("idle timeout, shutting down");
			args.shutdown();
		}
	}, 10_000);
	idleTimer.unref();

	let healthFails = 0;
	const healthTimer = setInterval(() => {
		try {
			fs.statSync(args.paths.socket);
			healthFails = 0;
		} catch {
			healthFails += 1;
			if (healthFails >= HEALTH_FAIL_LIMIT) {
				args.log("health check failed, shutting down", { fails: healthFails });
				args.shutdown();
			}
		}
	}, HEALTH_INTERVAL_MS);
	healthTimer.unref();

	process.on("SIGTERM", args.shutdown);
	process.on("SIGINT", args.shutdown);
}
