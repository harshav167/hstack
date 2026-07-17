/**
 * Capability registry: stable IDs + Cursor wire-name aliases for deny messages.
 * Append new aliases; never branch on model family.
 */

export interface NativeCapability {
	/** Stable config / rule key. */
	id: string;
	/** All known Cursor wire names (case-sensitive as emitted). */
	aliases: string[];
	/** Human phrase for messages ("native read tool"). */
	denyLabel: string;
	/** Hooked hard deny today, or inventory until a gate exists. */
	enforcement: "hard" | "inventory";
}

export function aliasListForMessage(capability: NativeCapability): string {
	return capability.aliases.join(" / ");
}

/** Hard-hooked capabilities + inventory for future gates. */
export const NATIVE_CAPABILITIES: NativeCapability[] = [
	{
		id: "read",
		aliases: ["Read", "ReadFile"],
		denyLabel: "native read tool",
		enforcement: "hard",
	},
	{
		id: "grep",
		aliases: ["Grep", "rg"],
		denyLabel: "native search tool",
		enforcement: "hard",
	},
	{
		id: "glob",
		aliases: ["Glob"],
		denyLabel: "native glob tool",
		enforcement: "hard",
	},
	{
		id: "edit",
		aliases: ["StrReplace", "ApplyPatch"],
		denyLabel: "native edit tool",
		enforcement: "hard",
	},
	{
		id: "write",
		aliases: ["Write", "ApplyPatch"],
		denyLabel: "native write tool",
		enforcement: "hard",
	},
	{
		id: "hub",
		aliases: ["Task", "Subagent", "AwaitShell"],
		denyLabel: "native task/subagent tool",
		enforcement: "hard",
	},
	{
		id: "delete",
		aliases: ["Delete"],
		denyLabel: "native delete tool",
		enforcement: "inventory",
	},
	{
		id: "notebook",
		aliases: ["EditNotebook"],
		denyLabel: "native notebook tool",
		enforcement: "inventory",
	},
	{
		id: "lints",
		aliases: ["ReadLints"],
		denyLabel: "native lints tool",
		enforcement: "inventory",
	},
	{
		id: "web",
		aliases: ["WebSearch", "WebFetch"],
		denyLabel: "native web tool",
		enforcement: "inventory",
	},
	{
		id: "browser",
		aliases: [
			"browser_navigate",
			"browser_snapshot",
			"browser_click",
			"browser_type",
			"browser_fill",
			"browser_tabs",
			"browser_lock",
			"browser_scroll",
			"browser_take_screenshot",
			"browser_cdp",
		],
		denyLabel: "cursor-ide-browser MCP tools",
		enforcement: "inventory",
	},
	{
		id: "mcp",
		aliases: ["GetMcpTools", "CallMcpTool", "FetchMcpResource"],
		denyLabel: "native MCP tools",
		enforcement: "inventory",
	},
	{
		id: "conversations",
		aliases: ["SearchConversations"],
		denyLabel: "native conversation search",
		enforcement: "inventory",
	},
	{
		id: "workflow",
		aliases: ["TodoWrite", "AskQuestion", "SwitchMode"],
		denyLabel: "native workflow tools",
		enforcement: "inventory",
	},
	{
		id: "workspace",
		aliases: ["SetActiveBranch"],
		denyLabel: "native workspace tools",
		enforcement: "inventory",
	},
	{
		id: "image",
		aliases: ["GenerateImage", "image_gen"],
		denyLabel: "native image tool",
		enforcement: "inventory",
	},
	{
		id: "shell",
		aliases: ["Shell", "AwaitShell"],
		denyLabel: "shell tool",
		enforcement: "inventory",
	},
	{
		id: "parallel",
		aliases: ["multi_tool_use.parallel"],
		denyLabel: "parallel tool orchestration",
		enforcement: "inventory",
	},
];

const BY_ID = new Map(NATIVE_CAPABILITIES.map(c => [c.id, c]));

export function getCapability(id: string): NativeCapability | undefined {
	return BY_ID.get(id);
}

/**
 * omp-shaped deny message. `ruleMessage` should already name wire aliases.
 */
export function formatDenyMessage(ruleMessage: string, command: string): string {
	return `Blocked: ${ruleMessage}\n\nOriginal command: ${command}`;
}
