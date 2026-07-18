/**
 * Per-session diagnostics dedup. Verbatim port of omp
 * `packages/coding-agent/src/lsp/diagnostics-ledger.ts`, adapted to the
 * daemon's `DiagnosticReport` shape. Identity strips the location prefix so a
 * diagnostic that merely moved lines still dedups.
 */
import type { DiagnosticReport } from "./format.ts";
import { summarizeDiagnosticMessages } from "./format.ts";

const DIAGNOSTIC_LOCATION_PREFIX_RE = /^.*?:\d+:\d+\s+/;

export function diagnosticIdentity(message: string): string {
	return message.replace(DIAGNOSTIC_LOCATION_PREFIX_RE, "");
}

export class DiagnosticsLedger {
	readonly #seen = new Map<string, Set<string>>();

	reduce(absPath: string, result: DiagnosticReport): DiagnosticReport {
		const previous = this.#seen.get(absPath);
		const currentIdentities = new Set<string>();
		const fresh: string[] = [];

		for (const message of result.messages) {
			const identity = diagnosticIdentity(message);
			currentIdentities.add(identity);
			if (!previous?.has(identity)) {
				fresh.push(message);
			}
		}

		if (currentIdentities.size === 0) {
			this.#seen.delete(absPath);
		} else {
			this.#seen.set(absPath, currentIdentities);
		}

		if (fresh.length === result.messages.length) {
			return result;
		}

		return {
			...result,
			messages: fresh,
			...summarizeDiagnosticMessages(fresh),
		};
	}

	forget(absPath: string): void {
		this.#seen.delete(absPath);
	}

	clear(): void {
		this.#seen.clear();
	}
}
