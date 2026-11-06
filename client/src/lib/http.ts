/**
 * The one fetch wrapper every feature uses: JSON in and out, and a typed
 * error carrying the server's message and field errors.
 */

interface ApiErrorBody {
  status?: number;
  message?: string;
  errors?: { path: string; message: string }[];
  retryAfterSeconds?: unknown;
}

/** An error carrying the server's structured field errors, when it sent any. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: { path: string; message: string }[];
  /** Seconds until a rate-limited request may be retried; only a finite number of at least 1. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    message: string,
    fieldErrors: { path: string; message: string }[],
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // The session cookie is same-origin; say so explicitly rather than rely on the default.
  const res = await fetch(url, { credentials: 'same-origin', ...init });

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body (proxy error, network appliance) — fall through.
    }
    const retry = body.retryAfterSeconds;
    throw new ApiError(
      res.status,
      body.message ?? res.statusText,
      body.errors ?? [],
      typeof retry === 'number' && Number.isFinite(retry) && retry >= 1 ? retry : undefined,
    );
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function jsonInit(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

const TOO_MANY_REQUESTS = 429;

/**
 * The line to show for a failed request: the server's own words when it is
 * rate limiting ("try again in a moment"), otherwise the caller's fallback.
 */
export function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status === TOO_MANY_REQUESTS ? error.message : fallback;
}
