/**
 * NDJSON transport for the hook↔daemon unix socket. A stream chunk may split
 * a frame or carry several; both sides buffer and only emit complete lines.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "./protocol.ts";
import { parseResponse } from "./protocol.ts";
import type { DaemonPaths } from "./daemon-paths.ts";
import { daemonPaths } from "./daemon-paths.ts";

/** Per-connection receiver: buffer raw bytes, split on \n, decode each complete frame once.
 *  Decoding per-chunk would corrupt multi-byte UTF-8 characters split across chunks. */
export function createNdjsonReceiver(onLine: (line: string) => void): (chunk: Buffer | Uint8Array) => void {
	const decoder = new TextDecoder("utf-8");
	let pending = new Uint8Array(0);
	return (chunk: Buffer | Uint8Array) => {
		const merged = new Uint8Array(pending.length + chunk.length);
		merged.set(pending, 0);
		merged.set(chunk, pending.length);
		pending = merged;
		let newline = pending.indexOf(10);
		while (newline !== -1) {
			const frame = pending.subarray(0, newline);
			pending = pending.subarray(newline + 1);
			const line = decoder.decode(frame, { stream: false }).trim();
			if (line.length > 0) onLine(line);
			newline = pending.indexOf(10);
		}
	};
}

/** One NDJSON round-trip: write the request line, resolve on the first complete response line. */
export async function daemonRequest(request: Request, timeoutMs = 4_000): Promise<Response> {
	const paths = daemonPaths();
	const { promise, resolve, reject } = Promise.withResolvers<Response>();
	const timer = setTimeout(() => reject(new Error("daemon request timed out")), timeoutMs);
	try {
		const socket = await Bun.connect({
			unix: paths.socket,
			socket: {
				data: (_sock, buf) => {
					receive(buf);
				},
				error: (_sock, error) => reject(error),
			},
		});
		const receive = createNdjsonReceiver(line => {
			try {
				const parsed = parseResponse(JSON.parse(line));
				if (!parsed) {
					reject(new Error("invalid daemon response"));
					return;
				}
				resolve(parsed);
			} catch {
				reject(new Error("invalid daemon response"));
			}
		});
		socket.write(`${JSON.stringify(request)}\n`);
		const response = await promise;
		socket.end();
		return response;
	} finally {
		clearTimeout(timer);
	}
}

export async function canConnect(socketPath: string): Promise<boolean> {
	try {
		const socket = await Bun.connect({ unix: socketPath, socket: { data: () => {}, error: () => {} } });
		socket.end();
		return true;
	} catch {
		return false;
	}
}

/** Hooks spawn the daemon on a cold socket. Returns true when one is reachable. */
export async function ensureDaemon(paths: DaemonPaths = daemonPaths()): Promise<boolean> {
	if (await canConnect(paths.socket)) return true;
	try {
		fs.mkdirSync(path.dirname(paths.socket), { recursive: true, mode: 0o700 });
		// fileURLToPath, not .pathname: URL-escapes spaces as %20 and Bun.spawn
		// does not decode them, so a space in the install path kills the daemon.
		const daemonEntry = fileURLToPath(new URL("./daemon-entry.ts", import.meta.url));
		const proc = Bun.spawn([process.execPath, daemonEntry], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
			env: { ...process.env },
		});
		proc.unref();
	} catch {
		return false;
	}
	for (let i = 0; i < 30; i++) {
		await Bun.sleep(50);
		if (await canConnect(paths.socket)) return true;
	}
	return false;
}
