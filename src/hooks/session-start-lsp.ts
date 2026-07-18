/**
 * sessionStart hook: attach the conversation to the LSP daemon, then export
 * the daemon socket and an availability note. Server warmup stays lazy (first
 * diagnose boots servers) so session start never blocks on LSP boot.
 */
import { readHookInput } from "../shared/hooks/hook-io.ts";
import { callDaemon, lspConfig, sessionIdOf, workspaceRootOf } from "../../features/lsp/hook-client.ts";
import { daemonPaths } from "../../features/lsp/daemon-paths.ts";

const input = await readHookInput();
const config = await lspConfig();

if (!config.enabled) {
	process.stdout.write("{}\n");
	process.exit(0);
}

const sessionId = sessionIdOf(input);
const root = workspaceRootOf(input);

const attached = await callDaemon({ op: "attach", sessionId, workspaceRoots: [root] }, 2_000);
const socketPath = daemonPaths().socket;

if (!attached || !("result" in attached)) {
	// Daemon unavailable: fail open with no env/context rather than block startup.
	process.stdout.write("{}\n");
	process.exit(0);
}

process.stdout.write(
	`${JSON.stringify({
		env: { HSTACK_LSP_SOCK: socketPath },
		additional_context: `<system-notice>LSP diagnostics active (daemon socket ${socketPath}). Diagnostics surface automatically after each edit.</system-notice>`,
	})}\n`,
);
