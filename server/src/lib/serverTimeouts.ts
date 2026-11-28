import type { Server } from 'node:http';

/** A client that has not sent its headers by then is dropped. */
const HEADERS_TIMEOUT_MS = 10_000;
/** A client has this long to send the whole request (headers and body); responses are not limited. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * A backstop against slow-loris style connections; the owner's Caddy is the
 * first line of defence.
 */
export function applyServerTimeouts(server: Server): void {
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
}
