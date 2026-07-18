import { describe, expect, test } from "bun:test";
import {
	dedupeDiagnostics,
	formatDiagnostic,
	formatDiagnosticsSummary,
	limitDiagnosticMessages,
	summarizeDiagnosticMessages,
} from "../../features/lsp/format.ts";
import { DiagnosticsLedger, diagnosticIdentity } from "../../features/lsp/ledger.ts";
import type { Diagnostic } from "../../features/lsp/types.ts";

function diag(line: number, message: string, severity: 1 | 2 | 3 | 4 = 1, source?: string): Diagnostic {
	return {
		range: { start: { line, character: 0 }, end: { line, character: 5 } },
		severity,
		message,
		...(source ? { source } : {}),
	};
}

describe("formatDiagnostic", () => {
	test("omp line shape: path:line:col [severity] [source] message (code)", () => {
		const d = { ...diag(11, "Cannot find name 'x'", 1, "ts"), code: 2304 };
		expect(formatDiagnostic(d, "src/a.ts")).toBe("src/a.ts:12:1 [error] [ts] Cannot find name 'x' (2304)");
	});

	test("strips bare-URL noise lines", () => {
		const d = diag(0, "bad thing\nfor further information visit https://example.com/x\nhttps://example.com");
		expect(formatDiagnostic(d, "f.go")).toBe("f.go:1:1 [error] bad thing");
	});
});

describe("dedupeDiagnostics", () => {
	test("same range+message from two servers collapses", () => {
		const a = diag(1, "unused import", 2);
		const b = diag(1, "unused import", 2);
		expect(dedupeDiagnostics([a, b])).toHaveLength(1);
	});
});

describe("formatDiagnosticsSummary", () => {
	test("counts by severity in omp shape", () => {
		const list = [diag(0, "a", 1), diag(1, "b", 1), diag(2, "c", 2)];
		expect(formatDiagnosticsSummary(list)).toBe("2 error(s), 1 warning(s)");
		expect(formatDiagnosticsSummary([])).toBe("no issues");
	});
});

describe("summarizeDiagnosticMessages", () => {
	test("recomputes from formatted lines", () => {
		const messages = ["a.ts:1:1 [error] boom", "a.ts:2:1 [warning] hmm"];
		const { summary, errored } = summarizeDiagnosticMessages(messages);
		expect(summary).toBe("1 error(s), 1 warning(s)");
		expect(errored).toBe(true);
	});
});

describe("limitDiagnosticMessages", () => {
	test("caps at 50", () => {
		expect(limitDiagnosticMessages(Array.from({ length: 60 }, (_, i) => `m${i}`))).toHaveLength(50);
	});
});

describe("DiagnosticsLedger", () => {
	test("second identical result surfaces nothing fresh", () => {
		const ledger = new DiagnosticsLedger();
		const report = {
			messages: ["a.ts:1:1 [error] Cannot find name 'x'", "a.ts:2:1 [warning] unused"],
			summary: "1 error(s), 1 warning(s)",
			errored: true,
		};
		const first = ledger.reduce("/abs/a.ts", report);
		expect(first.messages).toHaveLength(2);
		const second = ledger.reduce("/abs/a.ts", report);
		expect(second.messages).toHaveLength(0);
	});

	test("identity ignores location prefix — moved lines still dedup", () => {
		const ledger = new DiagnosticsLedger();
		ledger.reduce("/abs/a.ts", { messages: ["a.ts:1:1 [error] boom"], summary: "1 error(s)", errored: true });
		const moved = ledger.reduce("/abs/a.ts", { messages: ["a.ts:9:3 [error] boom"], summary: "1 error(s)", errored: true });
		expect(moved.messages).toHaveLength(0);
	});

	test("diagnosticIdentity strips path:line:col prefix", () => {
		expect(diagnosticIdentity("src/a.ts:12:1 [error] boom")).toBe("[error] boom");
	});

	test("clear file when diagnostics resolve, fresh ones resurface", () => {
		const ledger = new DiagnosticsLedger();
		ledger.reduce("/abs/a.ts", { messages: ["a.ts:1:1 [error] boom"], summary: "1 error(s)", errored: true });
		ledger.reduce("/abs/a.ts", { messages: [], summary: "no issues", errored: false });
		const again = ledger.reduce("/abs/a.ts", { messages: ["a.ts:1:1 [error] boom"], summary: "1 error(s)", errored: true });
		expect(again.messages).toHaveLength(1);
	});
});
