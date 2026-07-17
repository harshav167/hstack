/**
 * Extract a leading `cd <path> && …` prefix (omp bash.ts dual-check contract).
 * Constrained to a single line so a `&&` on a later line of a multiline script
 * cannot pull the entire script into the cwd capture.
 *
 * Returns the command with the leading cd stripped when safe; otherwise returns
 * the original command unchanged.
 */
export function normalizeLeadingCd(command: string): string {
	const cdMatch = command.match(/^cd[ \t]+((?:[^&\\\n\r]|\\.)+?)[ \t]*&&[ \t]*/);
	if (!cdMatch) return command;
	// Skip extraction when the path needs shell expansion ($VAR, $(...),
	// backticks) — same guard as omp.
	if (/[$`(]/.test(cdMatch[1])) return command;
	return command.slice(cdMatch[0].length);
}

/**
 * Commands to check against interceptor rules: original always, plus
 * cwd-normalized when a leading `cd … &&` was stripped.
 */
export function commandsToCheck(rawCommand: string): string[] {
	const normalized = normalizeLeadingCd(rawCommand);
	return rawCommand === normalized ? [rawCommand] : [rawCommand, normalized];
}
