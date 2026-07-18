import { describe, expect, test } from "bun:test";
import { Supervisor } from "../../features/lsp/supervisor.ts";

describe("Supervisor", () => {
	test("failure schedules the next allowed attempt with exponential backoff", () => {
		const s = new Supervisor({ maxRestarts: 3, windowMs: 60_000, backoffMs: 1_000 });
		s.recordFailure(1_000);
		expect(s.nextAttemptAt).toBe(2_000);
		s.recordFailure(2_000);
		expect(s.nextAttemptAt).toBe(4_000);
		expect(s.state).toBe("restarting");
	});

	test("budget exceeded → degraded, no further attempts scheduled", () => {
		const s = new Supervisor({ maxRestarts: 2, windowMs: 60_000, backoffMs: 100 });
		s.recordFailure(1_000);
		s.recordFailure(1_100);
		s.recordFailure(1_200);
		expect(s.state).toBe("degraded");
	});

	test("recordHealthy clears the gate", () => {
		const s = new Supervisor();
		s.recordFailure();
		s.recordHealthy();
		expect(s.nextAttemptAt).toBe(0);
		expect(s.state).toBe("healthy");
	});

	test("recordHealthy clears the crash budget", () => {
		const s = new Supervisor({ maxRestarts: 2, windowMs: 60_000, backoffMs: 100 });
		s.recordFailure(1_000);
		s.recordFailure(1_100);
		s.recordHealthy();
		s.recordFailure(2_000);
		s.recordFailure(2_100);
		expect(s.state).toBe("restarting");
		expect(s.state).not.toBe("degraded");
	});

	test("reset recovers from degraded", () => {
		const s = new Supervisor({ maxRestarts: 1, windowMs: 60_000, backoffMs: 100 });
		s.recordFailure(1_000);
		s.recordFailure(1_001);
		expect(s.state).toBe("degraded");
		s.reset();
		expect(s.state).toBe("healthy");
		expect(s.nextAttemptAt).toBe(0);
	});
});
