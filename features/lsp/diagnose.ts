/**
 * The diagnose pipeline: omp's writethrough, daemon-side. Freshness baseline
 * per server before sync, then inline wait vs timeout race. Timeout hands the
 * in-flight fetch to the pending channel (omp fetchDiagnosticsWithDeferral);
 * deferred-flagged servers boot off the inline path and land in pending too.
 */
import * as path from "node:path";
import { fileToUri } from "./uri.ts";
import {
	dedupeDiagnostics,
	type DiagnosticReport,
	formatDiagnostic,
	formatDiagnosticsSummary,
	limitDiagnosticMessages,
	sortDiagnostics,
} from "./format.ts";
import { applyPolicy, capTurn, type PolicyConfig } from "./policy.ts";
import type { PendingReport } from "./protocol.ts";
import type { DeferredRoute, RouteResult } from "./router.ts";
import type { Diagnostic } from "./types.ts";
import { waitForDiagnostics, WaitTimeoutError } from "./wait.ts";

const INLINE_SETTLE_MS = 250;
const PENDING_TIMEOUT_MS = 12_000;

export interface DiagnoseInput {
	readonly sessionId: string;
	readonly path: string;
	readonly workspaceRoot: string;
	readonly content: string;
	readonly timeoutMs: number;
}

export interface DiagnoseDeps {
	readonly policy: PolicyConfig;
	readonly log: (message: string, fields?: Record<string, unknown>) => void;
	readonly ledgerReduce: (sessionId: string, path: string, report: DiagnosticReport) => DiagnosticReport;
	/** Clear a path's seen set when its diagnostics fully resolve, so a reintroduced error surfaces again. */
	readonly ledgerForget: (sessionId: string, path: string) => void;
	/** Remaining per-turn diagnostic budget for this session (maxPerTurn across the whole hook turn, not per file). */
	readonly turnBudget: (sessionId: string) => number;
	/** Record how many diagnostics a turn surfaced, decrementing the session's remaining budget. */
	readonly consumeTurnBudget: (sessionId: string, count: number) => void;
	readonly pushPending: (pending: PendingReport) => void;
	/** Abort any in-flight deferred fetch for the same session+path before starting a new one. */
	readonly supersedeDeferred: (sessionId: string, path: string) => AbortController;
}

interface WaitPlan {
	readonly baselines: Map<string, number>;
	readonly expectedVersions: Map<string, number>;
}

async function syncRoutes(routes: readonly RouteResult[], input: DiagnoseInput, deps: DiagnoseDeps): Promise<WaitPlan> {
	const plan: WaitPlan = { baselines: new Map(), expectedVersions: new Map() };
	for (const route of routes) {
		const client = route.session.client;
		plan.baselines.set(route.session.key, client.diagnosticsVersion);
		try {
			const version = await client.syncContent(input.path, input.content);
			plan.expectedVersions.set(route.session.key, version);
			client.notifySaved(input.path);
		} catch (error) {
			deps.log("sync failed", { server: route.session.key, error: String(error) });
		}
	}
	return plan;
}

async function collect(
	routes: readonly RouteResult[],
	input: DiagnoseInput,
	displayPath: string,
	plan: WaitPlan,
	timeoutMs: number,
	deps: DiagnoseDeps,
	signal?: AbortSignal,
): Promise<DiagnosticReport | null> {
	const all: Diagnostic[] = [];
	const servers: string[] = [];
	// Parallel per omp getDiagnosticsForFile: a slow primary must not starve
	// the fast linters of the shared inline budget.
	const results = await Promise.allSettled(
		routes.map(async route => {
			const fresh = await waitForDiagnostics(route.session.client, fileToUri(input.path), {
				timeoutMs,
				minVersion: plan.baselines.get(route.session.key),
				expectedDocumentVersion: plan.expectedVersions.get(route.session.key),
				settleMs: INLINE_SETTLE_MS,
				...(signal ? { signal } : {}),
			});
			return { name: route.session.name, fresh };
		}),
	);
	for (const result of results) {
		if (result.status === "fulfilled") {
			all.push(...result.value.fresh);
			servers.push(result.value.name);
		} else if (!(result.reason instanceof WaitTimeoutError)) {
			deps.log("wait failed", { error: String(result.reason) });
		}
	}
	const filtered = dedupeDiagnostics(applyPolicy(all, deps.policy));
	// Per-turn cap across the whole hook turn (all files), not per file: clamp to
	// the session's remaining budget so ApplyPatch/MultiEdit can't exceed maxPerTurn.
	const budget = deps.turnBudget(input.sessionId);
	const unique = sortDiagnostics(capTurn(filtered, { ...deps.policy, maxPerTurn: budget }));
	const messages = limitDiagnosticMessages(unique.map(d => formatDiagnostic(d, displayPath)));
	if (servers.length === 0 && unique.length === 0) return null;
	deps.consumeTurnBudget(input.sessionId, unique.length);
	return {
		server: servers.join(", ") || undefined,
		messages,
		summary: formatDiagnosticsSummary(unique),
		errored: unique.some(d => (d.severity ?? 1) === 1),
	};
}

export async function diagnose(
	routes: { inline: RouteResult[]; deferred: DeferredRoute[] },
	input: DiagnoseInput,
	deps: DiagnoseDeps,
): Promise<{ kind: "ready"; report: DiagnosticReport; displayPath: string } | { kind: "pending" } | { kind: "clean" }> {
	const displayPath = path.relative(input.workspaceRoot, input.path) || input.path;
	const plan = await syncRoutes(routes.inline, input, deps);

	for (const deferred of routes.deferred) {
		trackDeferred(deferred, input, displayPath, deps);
	}

	if (routes.inline.length === 0) return { kind: "pending" };

	const inlineFetch = collect(routes.inline, input, displayPath, plan, input.timeoutMs, deps);
	const TIMEOUT = Symbol("timeout");
	const raced = await Promise.race([inlineFetch, Bun.sleep(input.timeoutMs).then(() => TIMEOUT)]);
	if (raced === TIMEOUT) {
		void inlineFetch.then(report => {
			if (!report) return;
			const deduped = deps.ledgerReduce(input.sessionId, input.path, report);
			if (deduped.messages.length === 0) return;
			deps.pushPending({ sessionId: input.sessionId, path: input.path, displayPath, report: deduped });
		});
		return { kind: "pending" };
	}
	const report = raced as DiagnosticReport | null;
	if (!report || (report.messages.length === 0 && !report.errored)) {
		// Fully resolved: clear the seen set so a reintroduced error is fresh again.
		deps.ledgerForget(input.sessionId, input.path);
		return { kind: "clean" };
	}
	const deduped = deps.ledgerReduce(input.sessionId, input.path, report);
	if (deduped.messages.length === 0 && report.messages.length > 0) return { kind: "clean" };
	return { kind: "ready", report: deduped, displayPath };
}

/** Deferred servers: sync + wait only after their background boot resolves. */
function trackDeferred(route: DeferredRoute, input: DiagnoseInput, displayPath: string, deps: DiagnoseDeps): void {
	// A newer write for the same path supersedes this fetch; the daemon aborts
	// the prior controller so its stale result never lands in pending.
	const controller = deps.supersedeDeferred(input.sessionId, input.path);
	void (async () => {
		const session = await route.ready;
		if (!session || controller.signal.aborted) return;
		const plan = await syncRoutes([{ session, config: route.config }], input, deps);
		if (controller.signal.aborted) return;
		const report = await collect(
			[{ session, config: route.config }],
			input,
			displayPath,
			plan,
			PENDING_TIMEOUT_MS,
			deps,
			controller.signal,
		);
		if (!report || controller.signal.aborted) return;
		if (report.messages.length === 0 && !report.errored) {
			deps.ledgerForget(input.sessionId, input.path);
			return;
		}
		const deduped = deps.ledgerReduce(input.sessionId, input.path, report);
		if (deduped.messages.length === 0) return;
		deps.pushPending({ sessionId: input.sessionId, path: input.path, displayPath, report: deduped });
	})().catch(() => {});
}
