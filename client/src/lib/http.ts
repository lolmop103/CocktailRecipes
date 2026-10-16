/**
 * The one fetch wrapper every feature uses: JSON in and out, and a typed
 * error carrying the server's message and field errors.
 */

interface ApiErrorBody {
  status?: number;
  message?: string;
  errors?: { path: string; message: string }[];
}

/** An error carrying the server's structured field errors, when it sent any. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: { path: string; message: string }[];

  constructor(status: number, message: string, fieldErrors: { path: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
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
    throw new ApiError(res.status, body.message ?? res.statusText, body.errors ?? []);
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
