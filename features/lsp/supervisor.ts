/**
 * Supervisor: restart crashed servers with backoff and a restart-window
 * budget. Ported from droid-lsp `internal/lsp/supervisor`. Exceeding the
 * budget marks the server degraded; the router consults `nextAttemptAt`
 * before every spawn, so the backoff actually gates restarts.
 */

export interface RestartPolicy {
	/** Max restarts allowed inside the window before the server is degraded. Default 3. */
	readonly maxRestarts: number;
	/** Window length in ms. Default 60_000. */
	readonly windowMs: number;
	/** Base backoff in ms; doubles per attempt, capped at 30s. Default 1_000. */
	readonly backoffMs: number;
}

export const DEFAULT_RESTART_POLICY: RestartPolicy = {
	maxRestarts: 3,
	windowMs: 60_000,
	backoffMs: 1_000,
};

const MAX_BACKOFF_MS = 30_000;

export type SupervisorState = "healthy" | "restarting" | "degraded";

export class Supervisor {
	#restarts: number[] = [];
	#state: SupervisorState = "healthy";
	#nextAttemptAt = 0;
	readonly #policy: RestartPolicy;

	constructor(policy: RestartPolicy = DEFAULT_RESTART_POLICY) {
		this.#policy = policy;
	}

	get state(): SupervisorState {
		return this.#state;
	}

	/** Earliest time a new spawn attempt is allowed. 0 = now. */
	get nextAttemptAt(): number {
		return this.#nextAttemptAt;
	}

	/** Record a crash and schedule the next allowed attempt. */
	recordFailure(now = Date.now()): void {
		const cutoff = now - this.#policy.windowMs;
		this.#restarts = [...this.#restarts.filter(t => t > cutoff), now];
		if (this.#restarts.length > this.#policy.maxRestarts) {
			this.#state = "degraded";
			return;
		}
		this.#state = "restarting";
		const backoff = Math.min(MAX_BACKOFF_MS, this.#policy.backoffMs * 2 ** (this.#restarts.length - 1));
		this.#nextAttemptAt = now + backoff;
	}

	/** Called after a successful initialize. A healthy lifetime earns a fresh crash budget. */
	recordHealthy(): void {
		this.#restarts = [];
		this.#state = "healthy";
		this.#nextAttemptAt = 0;
	}

	/** Manual recovery after degradation (e.g. config reload). */
	reset(): void {
		this.#restarts = [];
		this.#state = "healthy";
		this.#nextAttemptAt = 0;
	}
}
