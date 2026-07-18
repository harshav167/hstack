/**
 * Freshness-aware diagnostics wait. Verbatim port of omp `waitForDiagnostics`
 * (lsp/index.ts): exact document-version match wins immediately; unversioned
 * or mismatched publishes must sit quiet for the settle window so a stale
 * pre-edit publish is superseded by the fresh one.
 */
import type { LspClient } from "./client.ts";
import type { Diagnostic } from "./types.ts";

const POLL_MS = 50;
const SETTLE_MS = 250;

export interface WaitOptions {
	readonly timeoutMs: number;
	readonly minVersion?: number;
	readonly expectedDocumentVersion?: number;
	readonly settleMs?: number;
	readonly signal?: AbortSignal;
}

export class WaitTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`diagnostics wait timed out after ${timeoutMs}ms`);
		this.name = "WaitTimeoutError";
	}
}

export async function waitForDiagnostics(client: LspClient, uri: string, options: WaitOptions): Promise<readonly Diagnostic[]> {
	const { timeoutMs, minVersion, expectedDocumentVersion, settleMs = SETTLE_MS, signal } = options;
	// Pull-model servers (tsgo v7) never push: request instead of wait.
	// Pull responses are computed from current content, so the freshness
	// baseline doesn't apply — the answer is current by construction.
	if (client.config.pullDiagnostics) {
		return client.pullDiagnostics(uri, timeoutMs);
	}
	const start = Date.now();
	let settledVersion = -1;
	let settledAt = 0;

	while (Date.now() - start < timeoutMs) {
		if (signal?.aborted) throw new WaitTimeoutError(timeoutMs);
		const versionOk = minVersion === undefined || client.diagnosticsVersion > minVersion;
		const published = client.diagnostics.get(uri);
		const publishedVersion = client.documentVersions.get(uri);
		if (published !== undefined && versionOk) {
			if (expectedDocumentVersion !== undefined && publishedVersion === expectedDocumentVersion) {
				return published;
			}
			const currentVersion = client.diagnosticsVersion;
			if (currentVersion !== settledVersion) {
				settledVersion = currentVersion;
				settledAt = Date.now();
			} else if (Date.now() - settledAt >= settleMs) {
				return published;
			}
		}
		await Bun.sleep(POLL_MS);
	}

	throw new WaitTimeoutError(timeoutMs);
}
