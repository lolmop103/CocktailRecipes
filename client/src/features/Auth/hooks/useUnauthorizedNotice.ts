import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/http.js';
import { sessionKey } from './useSession.js';

const UNAUTHORIZED = 401;

/**
 * Notices when a change is refused because the admin session has ended. It
 * refreshes the session state (so the editing controls disappear) and raises
 * a notice — but never navigates: an open dialog keeps what was typed.
 */
export function useUnauthorizedNotice(): { expired: boolean; dismiss: () => void } {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);

  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        const error: unknown = event.mutation?.state.error;
        if (
          event.type === 'updated' &&
          error instanceof ApiError &&
          error.status === UNAUTHORIZED
        ) {
          setExpired(true);
          void client.invalidateQueries({ queryKey: sessionKey });
        }
      }),
    [client],
  );

  return { expired, dismiss: () => setExpired(false) };
}
