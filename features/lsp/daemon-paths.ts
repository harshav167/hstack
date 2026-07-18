/** Daemon runtime paths. Separated so both daemon and client transport import one source. */
import * as os from "node:os";
import * as path from "node:path";

export interface DaemonPaths {
	readonly socket: string;
	readonly pid: string;
	readonly log: string;
}

export function daemonPaths(home: string = os.homedir()): DaemonPaths {
	const runDir = path.join(home, ".hstack", "run");
	return {
		socket: path.join(runDir, "lspd.sock"),
		pid: path.join(runDir, "lspd.pid"),
		log: path.join(home, ".hstack", "logs", "lspd.log"),
	};
}
