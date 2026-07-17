/**
 * Model-agnostic capability registry.
 * Stable IDs internally; wire-name aliases for deny messages and soft guidance.
 * New alias discovered in the wild → append to `aliases[]`. No model-family branches.
 */

export interface NativeCapability {
	/** Stable config / rule key. */
	id: string;
	/** All known Cursor wire names (case-sensitive as emitted). */
	aliases: string[];
	/** Human phrase for messages ("native read tool"). */
	denyLabel: string;
	/** Hard-intercept in v1 shell-interceptor, or soft guidance only. */
	enforcement: "hard" | "soft";
}

export function aliasListForMessage(capability: NativeCapability): string {
	return capability.aliases.join(" / ");
}

/** omp-mapped hard intercept + soft inventory. */
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
		enforcement: "soft",
	},
	{
		id: "notebook",
		aliases: ["EditNotebook"],
		denyLabel: "native notebook tool",
		enforcement: "soft",
	},
	{
		id: "lints",
		aliases: ["ReadLints"],
		denyLabel: "native lints tool",
		enforcement: "soft",
	},
	{
		id: "web",
		aliases: ["WebSearch", "WebFetch"],
		denyLabel: "native web tool",
		enforcement: "soft",
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
		enforcement: "soft",
	},
	{
		id: "mcp",
		aliases: ["GetMcpTools", "CallMcpTool", "FetchMcpResource"],
		denyLabel: "native MCP tools",
		enforcement: "soft",
	},
	{
		id: "conversations",
		aliases: ["SearchConversations"],
		denyLabel: "native conversation search",
		enforcement: "soft",
	},
	{
		id: "workflow",
		aliases: ["TodoWrite", "AskQuestion", "SwitchMode"],
		denyLabel: "native workflow tools",
		enforcement: "soft",
	},
	{
		id: "workspace",
		aliases: ["SetActiveBranch"],
		denyLabel: "native workspace tools",
		enforcement: "soft",
	},
	{
		id: "image",
		aliases: ["GenerateImage", "image_gen"],
		denyLabel: "native image tool",
		enforcement: "soft",
	},
	{
		id: "shell",
		aliases: ["Shell", "AwaitShell"],
		denyLabel: "shell tool",
		enforcement: "soft",
	},
	{
		id: "parallel",
		aliases: ["multi_tool_use.parallel"],
		denyLabel: "parallel tool orchestration",
		enforcement: "soft",
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
