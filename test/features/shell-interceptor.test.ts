import { describe, expect, it } from "bun:test";
import { checkShellInterception, checkShellInterceptionWithCd } from "../../features/shell-interceptor/check.ts";
import { commandsToCheck, normalizeLeadingCd } from "../../features/shell-interceptor/cd-normalize.ts";
import { DEFAULT_SHELL_INTERCEPTOR_RULES } from "../../features/shell-interceptor/default-rules.ts";
import { evaluateShellCommand } from "../../features/shell-interceptor/evaluate.ts";
import type { ShellInterceptorRule } from "../../features/shell-interceptor/types.ts";
import { DEFAULT_HSTACK_CONFIG } from "../../src/shared/config/schema.ts";
import { getCapability } from "../../src/shared/native-tools/registry.ts";

describe("cd normalize", () => {
	it("strips leading cd … &&", () => {
		expect(normalizeLeadingCd("cd packages/coding-agent && cat package.json")).toBe("cat package.json");
	});

	it("does not strip when path needs shell expansion", () => {
		expect(normalizeLeadingCd("cd $HOME && cat x")).toBe("cd $HOME && cat x");
	});

	it("dual-check lists both raw and normalized", () => {
		expect(commandsToCheck("cd foo && cat bar")).toEqual(["cd foo && cat bar", "cat bar"]);
		expect(commandsToCheck("echo hi")).toEqual(["echo hi"]);
	});
});

describe("cd dual-check interception", () => {
	it("checks the original command before leading cd normalization", () => {
		const rules: ShellInterceptorRule[] = [
			{
				pattern: "^\\s*cd\\s+",
				capability: "read",
				message: "Do not hide directory changes in the command string.",
			},
		];
		const result = checkShellInterceptionWithCd(
			"cd packages/coding-agent && echo ok",
			["read"],
			rules,
		);
		expect(result.block).toBe(true);
		expect(result.message).toContain("Do not hide directory changes");
	});

	it("checks the cwd-normalized command after leading cd normalization", () => {
		const rules: ShellInterceptorRule[] = [
			{
				pattern: "^\\s*cat\\s+",
				capability: "read",
				message: "Use read instead.",
			},
		];
		const result = checkShellInterceptionWithCd(
			"cd packages/coding-agent && cat package.json",
			["read"],
			rules,
		);
		expect(result.block).toBe(true);
		expect(result.message).toContain("Use read instead");
	});
});

describe("default echo/printf redirect rule", () => {
	const tools = ["write"];

	it("blocks unquoted redirects to files", () => {
		expect(checkShellInterception("echo hi > out.txt", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(true);
		expect(checkShellInterception("echo hi >> out.txt", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(true);
		expect(checkShellInterception('printf "%s" foo > /tmp/x', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			true,
		);
	});

	it("blocks clobber and variable-target redirects", () => {
		expect(checkShellInterception("echo hi >| out.txt", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(true);
		expect(checkShellInterception("echo hi > $OUT", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(true);
	});

	it("does not block /dev device sink redirects", () => {
		expect(checkShellInterception("echo result > /dev/null", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			false,
		);
		expect(
			checkShellInterception("echo done > /dev/null 2>&1", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block,
		).toBe(false);
		expect(checkShellInterception('echo "" > /dev/tty', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception("echo x > /dev/stdout", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			false,
		);
		expect(
			checkShellInterception('echo "marker" > /dev/stderr', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block,
		).toBe(false);
		expect(checkShellInterception('echo x > "/dev/null"', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			false,
		);
	});

	it("still blocks real paths that resemble /dev sinks", () => {
		expect(checkShellInterception("echo data > ./dev/null", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			true,
		);
		expect(checkShellInterception("echo data > /devices/x", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(
			true,
		);
	});

	it("keeps scanning after allowed /dev sink redirects", () => {
		expect(
			checkShellInterception("echo data > /dev/null > out.txt", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block,
		).toBe(true);
		expect(
			checkShellInterception("printf x > /dev/stdout >> real.txt", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block,
		).toBe(true);
	});

	it("does not block `>` inside quoted text or fd duplication", () => {
		expect(checkShellInterception('echo "a -> b"', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception('echo "<p>hi</p>"', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception("printf 'use 2>&1'", tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception('echo "err" >&2', tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
	});
});

describe("default hub start rules", () => {
	const tools = ["hub"];

	it.each([
		"bun run dev",
		"vite --host 0.0.0.0",
		"lldb ./app",
		"bun test --watch",
		"nohup server",
		"server &",
	])("routes %s to hub", command => {
		const result = checkShellInterception(command, tools, DEFAULT_SHELL_INTERCEPTOR_RULES);
		expect(result.block).toBe(true);
		expect(result.suggestedCapability).toBe("hub");
	});

	it.each(["git diff -w", "docker compose up -d", "bun test", "printf 'server &'"])(
		"does not misclassify finite command %s",
		command => {
			expect(checkShellInterception(command, tools, DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		},
	);
});

describe("default read/grep/glob rules", () => {
	it("blocks cat/grep/find-name with alias-aware messages", () => {
		const cat = checkShellInterception("cat package.json", ["read"], DEFAULT_SHELL_INTERCEPTOR_RULES);
		expect(cat.block).toBe(true);
		expect(cat.message).toContain("Read");
		expect(cat.message).toContain("ReadFile");
		expect(cat.message).toContain("Original command: cat package.json");

		const grep = checkShellInterception("rg pattern", ["grep"], DEFAULT_SHELL_INTERCEPTOR_RULES);
		expect(grep.block).toBe(true);
		expect(grep.message).toContain("Grep");
		expect(grep.message).toContain("`rg`");

		const find = checkShellInterception("find . -name '*.ts'", ["glob"], DEFAULT_SHELL_INTERCEPTOR_RULES);
		expect(find.block).toBe(true);
		expect(find.message).toContain("Glob");
	});

	it("edit rules mention StrReplace and ApplyPatch", () => {
		const sed = checkShellInterception("sed -i 's/a/b/' file.ts", ["edit"], DEFAULT_SHELL_INTERCEPTOR_RULES);
		expect(sed.block).toBe(true);
		expect(sed.message).toContain("StrReplace");
		expect(sed.message).toContain("ApplyPatch");
	});
});

describe("activeCapabilities gating", () => {
	it("skips rule when capability is not active", () => {
		expect(checkShellInterception("cat foo", [], DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception("cat foo", ["grep"], DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(false);
		expect(checkShellInterception("cat foo", ["read"], DEFAULT_SHELL_INTERCEPTOR_RULES).block).toBe(true);
	});

	it("empty patterns allow all", () => {
		const config = {
			...DEFAULT_HSTACK_CONFIG,
			shellInterceptor: {
				...DEFAULT_HSTACK_CONFIG.shellInterceptor,
				patterns: [],
			},
		};
		expect(evaluateShellCommand("cat foo", config).permission).toBe("allow");
	});

	it("disabled interceptor allows all", () => {
		const config = {
			...DEFAULT_HSTACK_CONFIG,
			shellInterceptor: {
				...DEFAULT_HSTACK_CONFIG.shellInterceptor,
				enabled: false,
			},
		};
		expect(evaluateShellCommand("cat foo", config).permission).toBe("allow");
	});

	it("default config denies cat", () => {
		const result = evaluateShellCommand("cat package.json", DEFAULT_HSTACK_CONFIG);
		expect(result.permission).toBe("deny");
		expect(result.agent_message).toContain("Blocked:");
		expect(result.agent_message).toContain("Read");
	});
});

describe("registry aliases", () => {
	it("exposes Read/ReadFile for read capability", () => {
		const cap = getCapability("read");
		expect(cap?.aliases).toContain("Read");
		expect(cap?.aliases).toContain("ReadFile");
	});

	it("exposes Grep/rg for grep capability", () => {
		const cap = getCapability("grep");
		expect(cap?.aliases).toContain("Grep");
		expect(cap?.aliases).toContain("rg");
	});

	it("exposes Task/Subagent for hub capability", () => {
		const cap = getCapability("hub");
		expect(cap?.aliases).toContain("Task");
		expect(cap?.aliases).toContain("Subagent");
	});
});
