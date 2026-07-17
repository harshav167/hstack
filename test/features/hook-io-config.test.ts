import { describe, expect, it } from "bun:test";
import { extractCommand } from "../../src/shared/hooks/hook-io.ts";
import { loadConfig } from "../../src/shared/config/load.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("extractCommand", () => {
	it("reads beforeShellExecution.command", () => {
		expect(extractCommand({ command: "cat foo" })).toBe("cat foo");
	});

	it("reads preToolUse tool_input.command", () => {
		expect(extractCommand({ tool_input: { command: "rg x" } })).toBe("rg x");
	});

	it("returns undefined when missing", () => {
		expect(extractCommand({})).toBeUndefined();
		expect(extractCommand(null)).toBeUndefined();
	});
});

describe("loadConfig", () => {
	it("defaults when file missing", () => {
		const config = loadConfig(path.join(os.tmpdir(), "hstack-missing-config-xyz.json"));
		expect(config.shellInterceptor.enabled).toBe(true);
		expect(config.shellInterceptor.patterns).toBeNull();
		expect(config.shellInterceptor.activeCapabilities).toContain("read");
	});

	it("parses enabled false and empty patterns", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hstack-cfg-"));
		const file = path.join(dir, "config.json");
		fs.writeFileSync(
			file,
			JSON.stringify({
				shellInterceptor: { enabled: false, patterns: [], activeCapabilities: ["grep"] },
			}),
		);
		const config = loadConfig(file);
		expect(config.shellInterceptor.enabled).toBe(false);
		expect(config.shellInterceptor.patterns).toEqual([]);
		expect(config.shellInterceptor.activeCapabilities).toEqual(["grep"]);
	});
});
