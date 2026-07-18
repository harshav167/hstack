import { afterAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { LspClient } from "../../features/lsp/client.ts";
import { fileToUri } from "../../features/lsp/uri.ts";
import { loadServerConfig } from "../../features/lsp/config.ts";
import { DiagnosticStore } from "../../features/lsp/store.ts";
import { waitForDiagnostics } from "../../features/lsp/wait.ts";

const FIXTURES = path.join(import.meta.dir, "..", "fixtures", "lsp");
const clients: LspClient[] = [];

// Binary availability is a test-suite prerequisite, declared up front so a
// missing server reports as SKIP in the run — never as a passing test.
const BINARIES: Record<string, string> = {
	oxc: "oxlint",
	ruff: "ruff",
	gopls: "gopls",
	"typescript-7": "tsgo",
};
const hasBinary = (name: string) => Bun.which(BINARIES[name] ?? name) !== null;

afterAll(async () => {
	await Promise.allSettled(clients.map(c => c.shutdown()));
});

async function startServer(serverName: string, projectDir: string): Promise<{ client: LspClient; store: DiagnosticStore }> {
	const config = loadServerConfig(projectDir);
	const server = config.servers[serverName];
	if (!server?.resolvedCommand) {
		throw new Error(`${serverName}: configured but not resolvable on this machine`);
	}
	const store = new DiagnosticStore();
	const client = new LspClient(serverName, server, projectDir, store);
	// Binary resolves but startup must succeed — a broken startup is a failure,
	// not a skip (the review's silent-pass trap).
	await client.start(15_000);
	clients.push(client);
	return { client, store };
}

describe("oxlint LSP", () => {
	test.skipIf(!hasBinary("oxc"))("fresh diagnostics arrive for a TS file with an unused variable", async () => {
		const root = path.join(FIXTURES, "ts-project");
		const { client } = await startServer("oxc", root);
		const file = path.join(root, "src", "error.ts");
		const content = await Bun.file(file).text();
		const version = await client.syncContent(file, content);
		client.notifySaved(file);
		const diags = await waitForDiagnostics(client, fileToUri(file), {
			timeoutMs: 8_000,
			expectedDocumentVersion: version,
		});
		expect(diags.length).toBeGreaterThan(0);
		expect(diags.some(d => d.message.includes("unused_variable"))).toBe(true);
	}, 20_000);

	test.skipIf(!hasBinary("oxc"))("identical second sync is still fresh-versioned", async () => {
		const root = path.join(FIXTURES, "ts-project");
		const { client } = await startServer("oxc", root);
		const file = path.join(root, "src", "error.ts");
		const content = await Bun.file(file).text();
		const v1 = await client.syncContent(file, content);
		const v2 = await client.syncContent(file, content);
		expect(v2).toBe(v1 + 1);
	}, 20_000);
});

describe("ruff LSP", () => {
	test.skipIf(!hasBinary("ruff"))("fresh diagnostics arrive for a Python file with an undefined name", async () => {
		const root = path.join(FIXTURES, "py-project");
		const { client } = await startServer("ruff", root);
		const file = path.join(root, "broken.py");
		const version = await client.syncContent(file, await Bun.file(file).text());
		client.notifySaved(file);
		const diags = await waitForDiagnostics(client, fileToUri(file), {
			timeoutMs: 8_000,
			expectedDocumentVersion: version,
		});
		expect(diags.some(d => (d.severity ?? 1) === 1 && d.message.includes("undefined_name"))).toBe(true);
	}, 20_000);
});

describe("gopls", () => {
	test.skipIf(!hasBinary("gopls"))("diagnostics arrive for a Go file calling an undefined function", async () => {
		const root = path.join(FIXTURES, "go-project");
		const { client } = await startServer("gopls", root);
		const file = path.join(root, "main.go");
		const version = await client.syncContent(file, await Bun.file(file).text());
		client.notifySaved(file);
		const diags = await waitForDiagnostics(client, fileToUri(file), {
			timeoutMs: 15_000,
			expectedDocumentVersion: version,
		});
		expect(diags.some(d => d.message.includes("brokenCall"))).toBe(true);
	}, 30_000);
});

describe("typescript-7 (tsgo, pull model)", () => {
	test.skipIf(!hasBinary("typescript-7"))("pull diagnostics return the type error fast", async () => {
		const root = path.join(FIXTURES, "ts-project");
		const { client } = await startServer("typescript-7", root);
		expect(client.config.pullDiagnostics).toBe(true);
		const file = path.join(root, "src", "type-error.ts");
		const start = Date.now();
		const version = await client.syncContent(file, await Bun.file(file).text());
		client.notifySaved(file);
		const diags = await waitForDiagnostics(client, fileToUri(file), {
			timeoutMs: 15_000,
			expectedDocumentVersion: version,
		});
		expect(Date.now() - start).toBeLessThan(15_000);
		expect(diags.some(d => d.message.includes("not assignable"))).toBe(true);
	}, 30_000);
});
