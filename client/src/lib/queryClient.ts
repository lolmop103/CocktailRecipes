import { QueryClient } from '@tanstack/react-query';

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
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
