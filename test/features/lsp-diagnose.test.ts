import { describe, expect, test } from "bun:test";
import { diagnose, type DiagnoseDeps, type DiagnoseInput } from "../../features/lsp/diagnose.ts";
import type { DiagnosticReport } from "../../features/lsp/format.ts";
import { DiagnosticsLedger } from "../../features/lsp/ledger.ts";
import { DEFAULT_POLICY } from "../../features/lsp/policy.ts";
import type { DeferredRoute, RouteResult, ServerSession } from "../../features/lsp/router.ts";
import type { LspClient } from "../../features/lsp/client.ts";
import type { Diagnostic, ServerConfig } from "../../features/lsp/types.ts";

const CONFIG: ServerConfig = { command: "fake", fileTypes: [".ts"], rootMarkers: ["."] };

function diag(message: string, line = 0): Diagnostic {
	return {
		range: { start: { line, character: 0 }, end: { line, character: 1 } },
		severity: 1,
		message,
	};
}

const URI = "file:///r/f.ts";

/** Minimal LspClient stub: syncContent publishes diagnostics like the real client. */
function stubClient(published: readonly Diagnostic[]): LspClient {
	const diagnostics = new Map<string, readonly Diagnostic[]>();
	const documentVersions = new Map<string, number | null>();
	const client = {
		diagnosticsVersion: 0,
		diagnostics,
		documentVersions,
		config: { ...CONFIG },
		syncContent: async () => {
			// Mirror LspClient.#acceptDiagnostics: publish bumps the freshness version.
			diagnostics.set(URI, published);
			documentVersions.set(URI, 1);
			client.diagnosticsVersion += 1;
			return 1;
		},
		notifySaved: () => {},
	} as unknown as LspClient;
	return client;
}

function sessionFor(client: LspClient): ServerSession {
	return { key: "fake:/r", name: "fake", root: "/r", client };
}

function routeResult(client: LspClient): RouteResult {
	return { session: sessionFor(client), config: CONFIG };
}

function deferredRoute(client: LspClient): DeferredRoute {
	return { name: "fake", config: CONFIG, ready: Promise.resolve(sessionFor(client)) };
}

const INPUT: DiagnoseInput = {
	sessionId: "s",
	path: "/r/f.ts",
	workspaceRoot: "/r",
	content: "x",
	timeoutMs: 50,
};

function makeDeps(ledger: DiagnosticsLedger): DiagnoseDeps & {
	pushed: DiagnosticReport[];
	deferred: Map<string, AbortController>;
} {
	const pushed: DiagnosticReport[] = [];
	const deferred = new Map<string, AbortController>();
	return {
		pushed,
		deferred,
		policy: DEFAULT_POLICY,
		log: () => {},
		ledgerReduce: (s, p, r) => ledger.reduce(p, r),
		ledgerForget: (s, p) => ledger.forget(p),
		turnBudget: () => DEFAULT_POLICY.maxPerTurn,
		consumeTurnBudget: () => {},
		pushPending: p => pushed.push(p.report),
		supersedeDeferred: (s, p) => {
			const key = `${s}:${p}`;
			deferred.get(key)?.abort();
			const c = new AbortController();
			deferred.set(key, c);
			return c;
		},
	};
}

describe("diagnose ledger transitions", () => {
	test("error present then resolved clears the ledger so a reintroduced error surfaces", async () => {
		const ledger = new DiagnosticsLedger();
		const deps = makeDeps(ledger);

		// 1. error present -> ready
		const withError = await diagnose({ inline: [routeResult(stubClient([diag("boom")]))], deferred: [] }, INPUT, deps);
		expect(withError.kind).toBe("ready");

		// 2. same error again -> clean (deduped by ledger)
		const dup = await diagnose({ inline: [routeResult(stubClient([diag("boom")]))], deferred: [] }, INPUT, deps);
		expect(dup.kind).toBe("clean");

		// 3. error fixed (no diagnostics) -> clean, and ledger must forget the path
		const fixed = await diagnose({ inline: [routeResult(stubClient([]))], deferred: [] }, INPUT, deps);
		expect(fixed.kind).toBe("clean");

		// 4. same error reintroduced -> ready again (not swallowed by the ledger)
		const back = await diagnose({ inline: [routeResult(stubClient([diag("boom")]))], deferred: [] }, INPUT, deps);
		expect(back.kind).toBe("ready");
	});
});

describe("diagnose deferred supersede", () => {
	test("a newer write for the same path aborts the in-flight deferred fetch", async () => {
		const ledger = new DiagnosticsLedger();
		const deps = makeDeps(ledger);

		// Slow deferred server: only resolves after a tick.
		let releaseFirst!: (c: LspClient) => void;
		const firstReady = new Promise<LspClient>(res => (releaseFirst = res));
		const first: DeferredRoute = {
			name: "fake",
			config: CONFIG,
			ready: firstReady.then(c => sessionFor(c)),
		};

		// Fire the first diagnose; it registers a deferred controller for s:/r/f.ts.
		const d1 = diagnose({ inline: [], deferred: [first] }, INPUT, deps);
		// trackDeferred runs synchronously inside diagnose; yield once so it executes.
		await Bun.sleep(0);
		const key = "s:/r/f.ts";
		const firstController = deps.deferred.get(key);
		expect(firstController).toBeDefined();
		expect(firstController!.signal.aborted).toBe(false);

		// A second diagnose for the same path supersedes the first.
		const secondClient = stubClient([diag("new")]);
		const d2 = diagnose({ inline: [], deferred: [deferredRoute(secondClient)] }, INPUT, deps);
		await Bun.sleep(0);
		expect(firstController!.signal.aborted).toBe(true);

		// Resolve the first late; its (aborted) result must not be pushed.
		releaseFirst(stubClient([diag("old")]));
		await d1;
		const out2 = await d2;
		expect(out2.kind).toBe("pending");

		// Let microtasks flush; only the non-aborted second fetch may push.
		await Bun.sleep(20);
		const pushedMessages = deps.pushed.flatMap(r => r.messages);
		expect(pushedMessages.some(m => m.includes("old"))).toBe(false);
	});
});
