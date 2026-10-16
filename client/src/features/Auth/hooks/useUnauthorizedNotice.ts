import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionInfo } from '@cocktail/shared';
import { ApiError } from '@/lib/http.js';
import { sessionKey, useSession } from './useSession.js';

const UNAUTHORIZED = 401;

/**
 * Notices when a change is refused because the admin session has ended. It
 * refreshes the session state (so the editing controls disappear) and raises
 * a notice — but never navigates: an open dialog keeps what was typed.
 */
export function useUnauthorizedNotice(): { expired: boolean; dismiss: () => void } {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);
  const { isAdmin } = useSession();

  // Logging in again clears the notice.
  useEffect(() => {
    if (isAdmin) setExpired(false);
  }, [isAdmin]);

  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        const error: unknown = event.mutation?.state.error;
        // Only a session that existed can expire: a wrong password at login is a 401 too.
        const hadSession = client.getQueryData<SessionInfo>(sessionKey)?.authenticated === true;
        if (
          event.type === 'updated' &&
          hadSession &&
          error instanceof ApiError &&
          error.status === UNAUTHORIZED
        ) {
          setExpired(true);
          void client.invalidateQueries({ queryKey: sessionKey });
        }
      }),
    [client],
  );

  // Shown once the refreshed session confirms it is gone, and never to the admin.
  return { expired: expired && !isAdmin, dismiss: () => setExpired(false) };
}
