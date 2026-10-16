import type { Server } from 'node:http';

/** A client that has not sent its headers by then is dropped. */
const HEADERS_TIMEOUT_MS = 10_000;
/** No request may take longer than this end to end. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * A backstop against slow-loris style connections; the owner's Caddy is the
 * first line of defence.
 */
export function applyServerTimeouts(server: Server): void {
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
}
