import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getServersForFile, loadServerConfig } from "../../features/lsp/config.ts";

function withTmpProject(files: Record<string, string>, fn: (root: string) => void): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "hstack-lsp-config-"));
	try {
		for (const [rel, content] of Object.entries(files)) {
			const target = path.join(root, rel);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
		fn(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

describe("loadServerConfig", () => {
	test("bundled table applies with no overrides", () => {
		withTmpProject({}, root => {
			const config = loadServerConfig(root);
			expect(Object.keys(config.servers).length).toBeGreaterThan(0);
			expect(config.servers["typescript-7"]).toBeDefined();
			expect(config.servers["typescript-7"]?.command).toBe("tsgo");
			expect(config.servers["typescript-7"]?.resolvedCommand).toBeTruthy();
			// pyright etc are absent from the bundled table entirely
			expect(config.servers.pyright).toBeUndefined();
		});
	});

	test("project lsp.json overrides a bundled server by name", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						"typescript-7": { disabled: true },
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				expect(config.servers["typescript-7"]).toBeUndefined();
				expect(config.servers.oxc).toBeDefined();
			},
		);
	});

	test("override merges fields instead of replacing the entry", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						ruff: { settings: { lineLength: 120 } },
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				const ruff = config.servers.ruff;
				expect(ruff).toBeDefined();
				expect(ruff?.command).toBe("ruff");
				expect(ruff?.args).toEqual(["server"]);
				expect(ruff?.settings).toEqual({ lineLength: 120 });
			},
		);
	});

	test("initOptions deep-merge keeps bundled keys when user adds one", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						snyk: { initOptions: { token: "test-token-123" } },
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				const snyk = config.servers.snyk;
				expect(snyk).toBeDefined();
				expect(snyk?.initOptions?.token).toBe("test-token-123");
				expect(snyk?.initOptions?.activateSnykCode).toBe("true");
				expect(snyk?.initOptions?.activateSnykOpenSource).toBe("true");
			},
		);
	});

	test("deep merge recurses: one semgrep scan field doesn't wipe the ruleset list", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						semgrep: { initOptions: { scan: { ci: true } } },
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				const scan = config.servers.semgrep?.initOptions?.scan as Record<string, unknown> | undefined;
				expect(scan?.ci).toBe(true);
				expect(Array.isArray(scan?.configuration)).toBe(true);
			},
		);
	});

	test("omp shorthand: bare server map at root (no servers wrapper)", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					snyk: { disabled: true },
				}),
			},
			root => {
				const config = loadServerConfig(root);
				expect(config.servers.snyk).toBeUndefined();
				expect(config.servers.oxc).toBeDefined();
			},
		);
	});

	test("slash-bearing command resolves against the project root", () => {
		withTmpProject(
			{
				"bin/server": "#!/bin/sh\n",
				"lsp.json": JSON.stringify({
					servers: {
						custom: { command: "./bin/server", fileTypes: [".xyz"], rootMarkers: ["."] },
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				expect(config.servers.custom?.resolvedCommand).toBe(path.join(root, "bin", "server"));
			},
		);
	});

	test("server without a resolvable binary drops out", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						ghost: {
							command: "hstack-ghost-server-that-does-not-exist",
							fileTypes: [".ts"],
							rootMarkers: ["."],
						},
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				expect(config.servers.ghost).toBeUndefined();
			},
		);
	});

	test("custom server registers alongside bundled", () => {
		withTmpProject(
			{
				"lsp.json": JSON.stringify({
					servers: {
						custom: {
							command: "ruff",
							args: ["server"],
							fileTypes: [".xyz"],
							rootMarkers: ["."],
						},
					},
				}),
			},
			root => {
				const config = loadServerConfig(root);
				expect(config.servers.custom).toBeDefined();
				expect(config.servers.custom?.fileTypes).toEqual([".xyz"]);
			},
		);
	});
});

describe("getServersForFile", () => {
	test("typescript file matches tsc, oxc, semgrep, snyk — primary first", () => {
		withTmpProject({}, root => {
			const config = loadServerConfig(root);
			const matches = getServersForFile(config, path.join(root, "a.ts"));
			const names = matches.map(([name]) => name);
			expect(names).toContain("typescript-7");
			expect(names).toContain("oxc");
			expect(names).toContain("semgrep");
			expect(names.indexOf("typescript-7")).toBeLessThan(names.indexOf("oxc"));
		});
	});

	test("python file matches ty and ruff", () => {
		withTmpProject({}, root => {
			const config = loadServerConfig(root);
			const names = getServersForFile(config, path.join(root, "a.py")).map(([name]) => name);
			expect(names).toContain("ty");
			expect(names).toContain("ruff");
			expect(names).not.toContain("gopls");
		});
	});

	test("unknown extension matches nothing", () => {
		withTmpProject({}, root => {
			const config = loadServerConfig(root);
			expect(getServersForFile(config, path.join(root, "a.zzz"))).toEqual([]);
		});
	});
});
