/**
 * sessionEnd hook: release the conversation's ledger + pending entries.
 * Fire and forget; the daemon itself keeps running (idle timeout owns it).
 */
import { readHookInput } from "../shared/hooks/hook-io.ts";
import { callDaemon, lspConfig, sessionIdOf } from "../../features/lsp/hook-client.ts";

const input = await readHookInput();
const config = await lspConfig();

if (!config.enabled) {
	process.stdout.write("{}\n");
	process.exit(0);
}

void callDaemon({ op: "release", sessionId: sessionIdOf(input) }, 2_000);

process.stdout.write("{}\n");
