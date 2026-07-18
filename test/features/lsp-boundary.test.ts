import { describe, expect, test } from "bun:test";
import { parseResponse } from "../../features/lsp/protocol.ts";
import { parseJsonRpcMessage } from "../../features/lsp/types.ts";
import { mergePolicy, DEFAULT_POLICY, capTurn, applyPolicy } from "../../features/lsp/policy.ts";
import type { Diagnostic } from "../../features/lsp/types.ts";

describe("parseResponse", () => {
	test("accepts a ready response", () => {
		const out = parseResponse({
			ok: true,
			status: "ready",
			report: { messages: ["a.ts:1:1 [error] x"], summary: "1 error(s)", errored: true },
			displayPath: "a.ts",
		});
		expect(out).not.toBeNull();
		if (out && "status" in out) expect(out.status).toBe("ready");
	});

	test("accepts simple status and result responses", () => {
		expect(parseResponse({ ok: true, status: "clean" })).toEqual({ ok: true, status: "clean" });
		expect(parseResponse({ ok: true, result: "attached" })).toEqual({ ok: true, result: "attached" });
	});

	test("accepts error responses", () => {
		expect(parseResponse({ ok: false, error: "unknown request" })).toEqual({ ok: false, error: "unknown request" });
	});

	test("rejects malformed payloads instead of trusting them", () => {
		expect(parseResponse(null)).toBeNull();
		expect(parseResponse("ready")).toBeNull();
		expect(parseResponse({ status: "ready" })).toBeNull(); // missing ok
		expect(parseResponse({ ok: "true", status: "clean" })).toBeNull(); // ok not boolean
		expect(parseResponse({ ok: true, status: "bogus" })).toBeNull();
		expect(parseResponse({ ok: true, status: "ready" })).toBeNull(); // missing report
		expect(parseResponse({ ok: false })).toBeNull(); // missing error string
	});
});

describe("parseJsonRpcMessage", () => {
	test("parses request, notification, and response frames", () => {
		expect(parseJsonRpcMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).toMatchObject({
			id: 1,
			method: "initialize",
		});
		expect(parseJsonRpcMessage({ jsonrpc: "2.0", method: "initialized" })).toMatchObject({ method: "initialized" });
		expect(parseJsonRpcMessage({ jsonrpc: "2.0", id: 2, result: null })).toMatchObject({ id: 2 });
	});

	test("drops malformed frames", () => {
		expect(parseJsonRpcMessage(null)).toBeNull();
		expect(parseJsonRpcMessage({})).toBeNull(); // no jsonrpc tag
		expect(parseJsonRpcMessage({ jsonrpc: "1.0", method: "x" })).toBeNull();
		expect(parseJsonRpcMessage({ jsonrpc: "2.0" })).toBeNull(); // neither request/notification/response shape
		expect(parseJsonRpcMessage("frame")).toBeNull();
	});
});

describe("mergePolicy", () => {
	test("no overrides returns defaults", () => {
		expect(mergePolicy(undefined)).toEqual(DEFAULT_POLICY);
	});

	test("partial overrides fall back per key", () => {
		const merged = mergePolicy({ maxPerTurn: 5, deniedSources: ["semgrep"] });
		expect(merged.maxPerTurn).toBe(5);
		expect(merged.deniedSources).toEqual(["semgrep"]);
		expect(merged.minSeverity).toBe(DEFAULT_POLICY.minSeverity);
		expect(merged.maxPerFile).toBe(DEFAULT_POLICY.maxPerFile);
	});
});

describe("per-turn cap", () => {
	function diag(line: number, severity: 1 | 2 | 3 | 4 = 1): Diagnostic {
		return {
			range: { start: { line, character: 0 }, end: { line, character: 1 } },
			severity,
			message: `err-${line}`,
		};
	}

	test("capTurn clamps to the supplied remaining budget", () => {
		const many = Array.from({ length: 50 }, (_, i) => diag(i));
		const capped = capTurn(many, { ...DEFAULT_POLICY, maxPerTurn: 3 });
		expect(capped).toHaveLength(3);
	});

	test("applyPolicy still caps per file independently", () => {
		const many = Array.from({ length: 30 }, (_, i) => diag(i));
		const capped = applyPolicy(many, { ...DEFAULT_POLICY, maxPerFile: 20 });
		expect(capped).toHaveLength(20);
	});
});
