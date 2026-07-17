import type { CapabilityId, ShellInterceptorRule } from "./types.ts";

/**
 * Default rules — regex `pattern` bytes copied from omp
 * `DEFAULT_BASH_INTERCEPTOR_RULES`. `tool` → `capability`; messages remapped
 * for Cursor wire-name aliases.
 */
export const DEFAULT_SHELL_INTERCEPTOR_RULES: ShellInterceptorRule[] = [
	{
		pattern: "^\\s*(cat|head|tail|less|more)\\s+",
		capability: "read",
		message:
			"Use the native read tool (`Read` / `ReadFile`) instead of cat/head/tail. It provides better context and handles binary files.",
	},
	{
		pattern: "^\\s*(grep|rg|ripgrep|ag|ack)\\s+",
		capability: "grep",
		message:
			"Use the native search tool (`Grep` / `rg`) instead of grep/rg. It respects .gitignore and provides structured output.",
	},
	{
		pattern: "^\\s*(find|fd|locate)\\s+.*(-name|-iname|-type|--type|-glob)",
		capability: "glob",
		message:
			"Use the native glob tool (`Glob`) instead of find/fd. It respects .gitignore and is faster for glob patterns.",
	},
	{
		pattern: "^\\s*sed\\s+(-i|--in-place)",
		capability: "edit",
		message:
			"Use `StrReplace` or `ApplyPatch` instead of sed -i. They provide diff preview and fuzzy matching.",
	},
	{
		pattern: "^\\s*perl\\s+.*-[pn]?i",
		capability: "edit",
		message:
			"Use `StrReplace` or `ApplyPatch` instead of perl -i. They provide diff preview and fuzzy matching.",
	},
	{
		pattern: "^\\s*awk\\s+.*-i\\s+inplace",
		capability: "edit",
		message:
			"Use `StrReplace` or `ApplyPatch` instead of awk -i inplace. They provide diff preview and fuzzy matching.",
	},
	{
		// `>` must sit outside quoted regions (so `echo "a -> b"` passes) and be
		// followed by a plausible filename — including `$VAR` targets; `>|`
		// (clobber) counts as a redirect; `>&2`/`2>&1` style fd duplication is
		// not matched. Allowed device sinks are consumed while looking for later
		// real file redirects because the write tool cannot replace shell
		// output/discard targets.
		pattern:
			"^\\s*(echo|printf|cat\\s*<<)\\s+(?:(?:[^\"'>]|\"[^\"]*\"|'[^']*')|(?<!\\|)>{1,2}\\|?\\s*(?:\"/dev/(?:null|tty|stdout|stderr)\"|'/dev/(?:null|tty|stdout|stderr)'|/dev/(?:null|tty|stdout|stderr))(?:[\\s;&|]|$))*(?<!\\|)>{1,2}\\|?\\s*(?!(?:\"/dev/(?:null|tty|stdout|stderr)\"|'/dev/(?:null|tty|stdout|stderr)'|/dev/(?:null|tty|stdout|stderr))(?:[\\s;&|]|$))[$\\w./~\"'-]",
		capability: "write",
		message:
			"Use `Write` or `ApplyPatch` instead of echo/cat redirection. They handle encoding and provide confirmation.",
	},
	{
		pattern: "^\\s*nohup\\s+|(?<!&)\\&\\s*$",
		capability: "hub",
		message:
			'Use `Task` / `Subagent` (or `AwaitShell` for approved background jobs) instead of nohup or background shell syntax so the process stays observable and managed.',
	},
	{
		pattern:
			"^\\s*(?:(?:bun|npm|pnpm|yarn)\\s+(?:run\\s+)?(?:dev|start)(?:\\s|$)|(?:vite|next\\s+dev|nuxt\\s+dev|nodemon|lldb|gdb|tail\\s+-f)(?:\\s|$)|docker\\s+compose\\s+up(?!.*(?:\\s-d(?:\\s|$)|--detach))(?:\\s|$))",
		capability: "hub",
		message:
			'Use `Task` / `Subagent` for services, watchers, and debuggers so other sessions can observe and control them.',
	},
	{
		pattern:
			"^\\s*(?:(?:bun|npm|pnpm|yarn)\\s+(?:run\\s+)?\\S+|cargo\\s+watch|watchexec|pytest|vitest|jest|tsc)(?:.|\\n)*(?:--watch|-w)(?:\\s|$)",
		capability: "hub",
		message:
			'Use `Task` / `Subagent` for watch mode so its output, input, and lifecycle stay managed.',
	},
];

/** Default active capabilities — all omp-mapped hard-intercept IDs. */
export const DEFAULT_ACTIVE_CAPABILITIES: CapabilityId[] = [
	"read",
	"grep",
	"glob",
	"edit",
	"write",
	"hub",
];
