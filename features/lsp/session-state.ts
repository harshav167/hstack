/**
 * Per-conversation session state: ledgers, workspace roots, activity
 * timestamps, per-turn budgets, in-flight deferred controllers, and bounded
 * pending results. Split from daemon.ts — the daemon owns the socket and
 * request routing; this owns everything keyed by sessionId.
 */
import type { DiagnosticsLedger } from "./ledger.ts";
import type { PendingReport } from "./protocol.ts";

const MAX_PENDING_RESULTS = 200;
const SESSION_STATE_IDLE_EVICT_MS = 60 * 60 * 1000;
const TURN_WINDOW_MS = 30_000;

export class SessionState {
	readonly sessions = new Set<string>();
	readonly ledgers = new Map<string, DiagnosticsLedger>();
	readonly roots = new Map<string, readonly string[]>();
	readonly activity = new Map<string, number>();
	readonly turnUsage = new Map<string, { count: number; resetAt: number }>();
	readonly deferred = new Map<string, AbortController>();
	readonly pendingResults: PendingReport[] = [];

	attach(sessionId: string, workspaceRoots: readonly string[]): void {
		this.sessions.add(sessionId);
		this.activity.set(sessionId, Date.now());
		this.roots.set(sessionId, workspaceRoots);
	}

	touch(sessionId: string): void {
		this.activity.set(sessionId, Date.now());
	}

	release(sessionId: string): void {
		this.sessions.delete(sessionId);
		this.activity.delete(sessionId);
		this.roots.delete(sessionId);
		this.turnUsage.delete(sessionId);
		this.ledgers.delete(sessionId);
		for (const [key, controller] of this.deferred) {
			if (key.startsWith(`${sessionId}:`)) {
				controller.abort();
				this.deferred.delete(key);
			}
		}
		for (let i = this.pendingResults.length - 1; i >= 0; i--) {
			if (this.pendingResults[i].sessionId === sessionId) this.pendingResults.splice(i, 1);
		}
	}

	/** Evict state for conversations that never sent release (crashed client, hook timeout). */
	evictIdle(now = Date.now()): void {
		const cutoff = now - SESSION_STATE_IDLE_EVICT_MS;
		for (const [sessionId, lastSeen] of this.activity) {
			if (lastSeen > cutoff) continue;
			this.release(sessionId);
		}
	}

	turnBudget(sessionId: string, maxPerTurn: number): number {
		const usage = this.turnUsage.get(sessionId);
		if (!usage || Date.now() >= usage.resetAt) return maxPerTurn;
		return Math.max(0, maxPerTurn - usage.count);
	}

	consumeTurnBudget(sessionId: string, count: number): void {
		if (count <= 0) return;
		const usage = this.turnUsage.get(sessionId);
		if (!usage || Date.now() >= usage.resetAt) {
			this.turnUsage.set(sessionId, { count, resetAt: Date.now() + TURN_WINDOW_MS });
			return;
		}
		usage.count += count;
	}

	/** Abort any in-flight deferred fetch for sessionId:path; return the controller for the new one. */
	supersedeDeferred(sessionId: string, path: string): AbortController {
		const key = `${sessionId}:${path}`;
		this.deferred.get(key)?.abort();
		const controller = new AbortController();
		this.deferred.set(key, controller);
		return controller;
	}

	/** Bounded push: drop the oldest pending reports past the cap, and skip released sessions. */
	pushPending(pending: PendingReport): void {
		if (!this.sessions.has(pending.sessionId)) return;
		this.pendingResults.push(pending);
		if (this.pendingResults.length > MAX_PENDING_RESULTS) {
			this.pendingResults.splice(0, this.pendingResults.length - MAX_PENDING_RESULTS);
		}
	}

	drain(sessionId: string): PendingReport[] {
		const out: PendingReport[] = [];
		for (let i = this.pendingResults.length - 1; i >= 0; i--) {
			if (this.pendingResults[i].sessionId === sessionId) {
				out.unshift(this.pendingResults[i]);
				this.pendingResults.splice(i, 1);
			}
		}
		return out;
	}
}
