/** JSON-RPC over stdio framing: Content-Length header encode + buffer scan. */

export function encodeFrame(message: unknown): Uint8Array {
	const body = new TextEncoder().encode(JSON.stringify(message));
	const header = new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n`);
	const frame = new Uint8Array(header.length + body.length);
	frame.set(header, 0);
	frame.set(body, header.length);
	return frame;
}

/** Index of the \r\n\r\n header terminator, or -1 when the buffer is incomplete. */
export function findHeaderEnd(buffer: Uint8Array): number {
	for (let i = 0; i + 3 < buffer.length; i++) {
		if (buffer[i] === 13 && buffer[i + 1] === 10 && buffer[i + 2] === 13 && buffer[i + 3] === 10) {
			return i;
		}
	}
	return -1;
}
