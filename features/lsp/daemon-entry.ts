/**
 * Detached daemon entrypoint. Hooks spawn this on a cold socket; it detaches
 * from the hook's lifecycle and owns the unix socket until idle shutdown.
 */
import { loadConfig } from "../../src/shared/config/load.ts";
import { LspDaemon } from "./daemon.ts";
import { mergePolicy } from "./policy.ts";

const config = loadConfig();
const idleTimeoutMs = config.lsp?.idleTimeoutMs;
const policy = mergePolicy(config.lsp?.policy);

const daemon = new LspDaemon(undefined, {
	policy,
	...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
});
daemon.start();
