import { describe, expect, test } from "bun:test";
import { createNdjsonReceiver } from "../../features/lsp/transport.ts";

describe("createNdjsonReceiver", () => {
	test("a frame split across chunks emits once, complete", () => {
		const lines: string[] = [];
		const receive = createNdjsonReceiver(line => lines.push(line));
		receive(Buffer.from('{"ok":true,"stat'));
		expect(lines).toHaveLength(0);
		receive(Buffer.from('us":"ready"}\n'));
		expect(lines).toEqual(['{"ok":true,"status":"ready"}']);
	});

	test("two frames in one chunk emit in order", () => {
		const lines: string[] = [];
		const receive = createNdjsonReceiver(line => lines.push(line));
		receive(Buffer.from('{"a":1}\n{"b":2}\n'));
		expect(lines).toEqual(['{"a":1}', '{"b":2}']);
	});

	test("tail survives across mixed boundaries", () => {
		const lines: string[] = [];
		const receive = createNdjsonReceiver(line => lines.push(line));
		receive(Buffer.from('{"a'));
		receive(Buffer.from('":1}\n{"b'));
		receive(Buffer.from('":2}\n{"c":3}\n'));
		expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
	});

	test("blank lines are ignored", () => {
		const lines: string[] = [];
		const receive = createNdjsonReceiver(line => lines.push(line));
		receive(Buffer.from('\n\n{"a":1}\n\n'));
		expect(lines).toEqual(['{"a":1}']);
	});
});
