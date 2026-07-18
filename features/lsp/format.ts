/**
 * Diagnostic formatting: line shape, dedup, caps, and summaries.
 * Mirrors omp `lsp/utils.ts` formatting contracts so injected text looks
 * identical to what the omp write/edit tools surface.
 */
import type { Diagnostic, DiagnosticSeverity } from "./types.ts";

export const DIAGNOSTIC_MESSAGE_LIMIT = 50;

export interface DiagnosticReport {
	/** Servers that contributed, comma-joined. */
	readonly server?: string;
	readonly messages: string[];
	readonly summary: string;
	readonly errored: boolean;
}

const SEVERITY_NAMES: Record<DiagnosticSeverity, string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

export function severityToString(severity?: DiagnosticSeverity): string {
	return SEVERITY_NAMES[severity ?? 1] ?? "unknown";
}

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.sort((a, b) => {
		const aSeverity = a.severity ?? 1;
		const bSeverity = b.severity ?? 1;
		if (aSeverity !== bSeverity) return aSeverity - bSeverity;
		if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
		if (a.range.start.character !== b.range.start.character) return a.range.start.character - b.range.start.character;
		return a.message.localeCompare(b.message);
	});
}

function stripDiagnosticNoise(message: string): string {
	return message
		.split("\n")
		.filter(line => {
			const trimmed = line.trim();
			if (trimmed.startsWith("for further information visit")) return false;
			if (/^https?:\/\//.test(trimmed)) return false;
			return true;
		})
		.join("\n")
		.trim();
}

export function formatDiagnostic(diagnostic: Diagnostic, filePath: string): string {
	const severity = severityToString(diagnostic.severity);
	const line = diagnostic.range.start.line + 1;
	const col = diagnostic.range.start.character + 1;
	const source = diagnostic.source ? `[${diagnostic.source}] ` : "";
	const code = diagnostic.code ? ` (${diagnostic.code})` : "";
	const message = stripDiagnosticNoise(diagnostic.message);
	return `${filePath}:${line}:${col} [${severity}] ${source}${message}${code}`;
}

/** Cross-server dedup key: identical range + message collapses. */
export function diagnosticDedupKey(d: Diagnostic): string {
	return `${d.range.start.line}:${d.range.start.character}:${d.range.end.line}:${d.range.end.character}:${d.message}`;
}

export function dedupeDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	const seen = new Set<string>();
	const unique: Diagnostic[] = [];
	for (const d of diagnostics) {
		const key = diagnosticDedupKey(d);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(d);
	}
	return unique;
}

export function limitDiagnosticMessages(messages: string[]): string[] {
	return messages.length <= DIAGNOSTIC_MESSAGE_LIMIT ? messages : messages.slice(0, DIAGNOSTIC_MESSAGE_LIMIT);
}

export function formatDiagnosticsSummary(diagnostics: readonly Diagnostic[]): string {
	const counts = { error: 0, warning: 0, info: 0, hint: 0 };
	for (const d of diagnostics) {
		const sev = severityToString(d.severity);
		if (sev in counts) counts[sev as keyof typeof counts]++;
	}
	const parts: string[] = [];
	if (counts.error > 0) parts.push(`${counts.error} error(s)`);
	if (counts.warning > 0) parts.push(`${counts.warning} warning(s)`);
	if (counts.info > 0) parts.push(`${counts.info} info(s)`);
	if (counts.hint > 0) parts.push(`${counts.hint} hint(s)`);
	return parts.length > 0 ? parts.join(", ") : "no issues";
}

export function summarizeDiagnosticMessages(messages: readonly string[]): { summary: string; errored: boolean } {
	const counts = { error: 0, warning: 0, info: 0, hint: 0 };
	for (const message of messages) {
		const match = message.match(/\[(error|warning|info|hint)\]/i);
		if (!match) continue;
		const key = match[1].toLowerCase() as keyof typeof counts;
		counts[key] += 1;
	}
	const parts: string[] = [];
	if (counts.error > 0) parts.push(`${counts.error} error(s)`);
	if (counts.warning > 0) parts.push(`${counts.warning} warning(s)`);
	if (counts.info > 0) parts.push(`${counts.info} info(s)`);
	if (counts.hint > 0) parts.push(`${counts.hint} hint(s)`);
	return {
		summary: parts.length > 0 ? parts.join(", ") : "no issues",
		errored: counts.error > 0,
	};
}

/** Render one file's report into the `additional_context` block. */
export function renderReportText(report: DiagnosticReport, displayPath: string, opts: { late?: boolean } = {}): string {
	const heading = opts.late
		? `<system-notice>Late LSP diagnostics arrived after the edit returned for ${displayPath} — ${report.summary}`
		: `<system-notice>LSP diagnostics for ${displayPath} — ${report.summary}`;
	return [heading, ...report.messages, "</system-notice>"].join("\n");
}
