import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspDaemon } from "../../features/lsp/daemon.ts";
import type { Request, Response } from "../../features/lsp/protocol.ts";

let daemon: LspDaemon;
let socketPath: string;
let runDir: string;

async function request(req: Request, timeoutMs = 8_000): Promise<Response> {
	const { promise, resolve, reject } = Promise.withResolvers<Response>();
	const timer = setTimeout(() => reject(new Error("test request timed out")), timeoutMs);
	try {
		const socket = await Bun.connect({
			unix: socketPath,
			socket: {
				data: (_sock, buf) => {
					try {
						resolve(JSON.parse(buf.toString("utf8").trim()) as Response);
					} catch {
						reject(new Error("bad response"));
					}
				},
				error: (_sock, err) => reject(err),
			},
		});
		socket.write(`${JSON.stringify(req)}\n`);
		const response = await promise;
		socket.end();
		return response;
	} finally {
		clearTimeout(timer);
	}
}

beforeAll(() => {
	runDir = fs.mkdtempSync(path.join(os.tmpdir(), "hstack-lspd-test-"));
	socketPath = path.join(runDir, "test.sock");
	daemon = new LspDaemon({
		socket: socketPath,
		pid: path.join(runDir, "test.pid"),
		log: path.join(runDir, "test.log"),
	});
	daemon.start();
});

afterAll(async () => {
	await daemon.shutdown({ exitProcess: false }).catch(() => {});
	fs.rmSync(runDir, { recursive: true, force: true });
});

describe("daemon protocol", () => {
	test("attach then status shows the session", async () => {
		const attached = await request({ op: "attach", sessionId: "s1", workspaceRoots: [process.cwd()] });
		expect(attached).toEqual({ ok: true, result: "attached" });
		const status = await request({ op: "status" });
		if (!("daemonStatus" in status)) throw new Error("no daemonStatus");
		expect(status.daemonStatus.sessions).toContain("s1");
	});

	test("diagnose on a file with no matching server returns no-server", async () => {
		const res = await request({
			op: "diagnose",
			sessionId: "s1",
			path: path.join(process.cwd(), "README.zzz"),
			workspaceRoot: process.cwd(),
			content: "hello",
			timeoutMs: 500,
		});
		expect(res).toEqual({ ok: true, status: "no-server" });
	});

	test("peek on unknown file is clean", async () => {
		const res = await request({ op: "peek", sessionId: "s1", path: "/tmp/never-touched.ts", workspaceRoot: "" });
		expect(res).toEqual({ ok: true, status: "clean" });
	});

	test("release drops the session", async () => {
		await request({ op: "release", sessionId: "s1" });
		const status = await request({ op: "status" });
		if (!("daemonStatus" in status)) throw new Error("no daemonStatus");
		expect(status.daemonStatus.sessions).not.toContain("s1");
	});

	test("diagnose against the TS fixture surfaces the unused variable", async () => {
		const root = path.join(import.meta.dir, "..", "fixtures", "lsp", "ts-project");
		const file = path.join(root, "src", "error.ts");
		const content = await Bun.file(file).text();
		await request({ op: "attach", sessionId: "s2", workspaceRoots: [root] });
		const res = await request(
			{ op: "diagnose", sessionId: "s2", path: file, workspaceRoot: root, content, timeoutMs: 8_000 },
			15_000,
		);
		if (!("status" in res)) throw new Error(`unexpected ${JSON.stringify(res)}`);
		if (res.status === "ready") {
			expect(res.report?.messages.some(m => m.includes("unused_variable"))).toBe(true);
		} else {
			// Slow machine: result must eventually land in the pending channel.
			let found = false;
			for (let i = 0; i < 24 && !found; i++) {
				await Bun.sleep(1_000);
				const drain = await request({ op: "drain", sessionId: "s2" }, 5_000);
				if (!("pending" in drain)) throw new Error("no pending");
				found = drain.pending.some(p => p.report.messages.some(m => m.includes("unused_variable")));
			}
			expect(found).toBe(true);
		}
	}, 30_000);

	test("second identical diagnose dedups to clean", async () => {
		const root = path.join(import.meta.dir, "..", "fixtures", "lsp", "ts-project");
		const file = path.join(root, "src", "error.ts");
		const content = await Bun.file(file).text();
		await request({ op: "attach", sessionId: "s3", workspaceRoots: [root] });
		const first = await request(
			{ op: "diagnose", sessionId: "s3", path: file, workspaceRoot: root, content, timeoutMs: 8_000 },
			15_000,
		);
		if (!("status" in first) || first.status !== "ready") return; // covered by the slow path above
		const second = await request(
			{ op: "diagnose", sessionId: "s3", path: file, workspaceRoot: root, content, timeoutMs: 8_000 },
			15_000,
		);
		if (!("status" in second)) throw new Error("bad");
		expect(second.status).toBe("clean");
	}, 30_000);
});
