import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http.js';

const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 499;

/**
 * A failed read is retried once — unless the server said it was the request
 * itself (4xx): repeating a 429 would only deepen the rate limit, and a 400
 * will fail the same way again.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status >= CLIENT_ERROR_MIN &&
    error.status <= CLIENT_ERROR_MAX
  ) {
    return false;
  }
  return failureCount < 1;
}

/**
 * A single client for the app. The defaults are deliberate:
 * - `staleTime` avoids a refetch storm when several components mount at once;
 * - mutation retries stay off, because a failed write must not be silently
 *   repeated against a non-idempotent endpoint.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
