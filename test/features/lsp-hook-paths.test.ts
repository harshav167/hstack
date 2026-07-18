import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { changedPathsOf } from "../../features/lsp/hook-client.ts";
import { detectRoot } from "../../features/lsp/router.ts";

describe("changedPathsOf", () => {
	const base = { workspace_roots: ["/repo"], conversation_id: "s1" };

	test("Write path field", () => {
		const input = { ...base, tool_name: "Write", tool_input: { path: "/repo/src/a.ts" } };
		expect(changedPathsOf(input)).toEqual(["/repo/src/a.ts"]);
	});

	test("StrReplace file_path field, relative resolved against root", () => {
		const input = { ...base, tool_name: "StrReplace", tool_input: { file_path: "src/a.ts" } };
		expect(changedPathsOf(input)).toEqual([path.resolve("/repo", "src/a.ts")]);
	});

	test("MultiEdit per-edit file fields, normalized against root", () => {
		const input = {
			...base,
			tool_name: "MultiEdit",
			tool_input: {
				edits: [
					{ file_path: "src/a.ts", old_string: "x", new_string: "y" },
					{ path: "src/b.ts", old_string: "x", new_string: "y" },
					{ target_file: "/abs/c.ts", old_string: "x", new_string: "y" },
				],
			},
		};
		expect(changedPathsOf(input)).toEqual([
			path.resolve("/repo", "src/a.ts"),
			path.resolve("/repo", "src/b.ts"),
			"/abs/c.ts",
		]);
	});

	test("ApplyPatch: every file header is extracted", () => {
		const patch = [
			"*** Begin Patch",
			"*** Update File: src/a.ts",
			"@@",
			"-old",
			"+new",
			"*** Add File: src/b.ts",
			"+content",
			"*** Delete File: src/c.ts",
			"*** End Patch",
		].join("\n");
		const input = { ...base, tool_name: "ApplyPatch", tool_input: { patch } };
		expect(changedPathsOf(input)).toEqual([
			path.resolve("/repo", "src/a.ts"),
			path.resolve("/repo", "src/b.ts"),
			path.resolve("/repo", "src/c.ts"),
		]);
	});

	test("ApplyPatch with no headers yields nothing", () => {
		const input = { ...base, tool_name: "ApplyPatch", tool_input: { patch: "*** Begin Patch\n*** End Patch" } };
		expect(changedPathsOf(input)).toEqual([]);
	});
});

describe("detectRoot", () => {
	test("dot-only markers mean the workspace root, not the file's directory", () => {
		expect(detectRoot("/project/src/deep/a.ts", ["."], "/project")).toBe("/project");
	});

	test("real markers still walk up", () => {
		expect(detectRoot("/project/src/a.ts", ["definitely-no-such-marker"], "/fallback")).toBe("/fallback");
	});
});
