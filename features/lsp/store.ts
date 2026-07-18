/**
 * Central diagnostics store. Ported from droid-lsp `internal/lsp/store`.
 * Slots are keyed `slotId::uri` where slotId is the router session key
 * (`serverName:root`) — one global daemon serves many roots, so a shutdown
 * in one project must never wipe another project's published diagnostics.
 */
import type { Diagnostic } from "./types.ts";

export interface StoreEntry {
	readonly uri: string;
	/** Bare server name (e.g. "gopls") — display/reporting. */
	readonly serverName: string;
	/** Owning session key (e.g. "gopls:/repo") — removal scope. */
	readonly slotId: string;
	readonly diagnostics: readonly Diagnostic[];
	readonly version: number | null;
	readonly updatedAt: number;
}

export class DiagnosticStore {
	readonly #entries = new Map<string, StoreEntry>();

	publish(slotId: string, serverName: string, uri: string, diagnostics: readonly Diagnostic[], version: number | null): void {
		this.#entries.set(`${slotId}::${uri}`, {
			uri,
			serverName,
			slotId,
			diagnostics,
			version,
			updatedAt: Date.now(),
		});
	}

	/** Latest entry per server for a URI, newest first. */
	peekAll(uri: string): StoreEntry[] {
		const out: StoreEntry[] = [];
		for (const entry of this.#entries.values()) {
			if (entry.uri === uri) out.push(entry);
		}
		return out.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/** Remove every entry owned by one session (name:root), nothing else. */
	removeSession(slotId: string): void {
		for (const [key, entry] of this.#entries) {
			if (entry.slotId === slotId) this.#entries.delete(key);
		}
	}

	snapshot(): StoreEntry[] {
		return [...this.#entries.values()];
	}

	clear(): void {
		this.#entries.clear();
	}
}
