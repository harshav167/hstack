/**
 * stop hook: drain late LSP diagnostics for this conversation. Surfaces as
 * `followup_message` (loop-limit safe) — the Cursor analogue of omp's
 * `<system-notice>` late-injection channel.
 */
import { readHookInput } from "../shared/hooks/hook-io.ts";
import { callDaemon, lspConfig, sessionIdOf } from "../../features/lsp/hook-client.ts";
import { renderReportText } from "../../features/lsp/format.ts";

const input = await readHookInput();
const config = await lspConfig();

if (!config.enabled) {
	process.stdout.write("{}\n");
	process.exit(0);
}

const sessionId = sessionIdOf(input);
const response = await callDaemon({ op: "drain", sessionId }, 2_000);

if (!response || !("pending" in response) || response.pending.length === 0) {
	process.stdout.write("{}\n");
	process.exit(0);
}

const sections = response.pending.map(p => renderReportText(p.report, p.displayPath, { late: true }));
process.stdout.write(`${JSON.stringify({ followup_message: sections.join("\n\n") })}\n`);
