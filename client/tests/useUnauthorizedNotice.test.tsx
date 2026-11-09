import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from './testUtils.js';
import { ApiError } from '../src/lib/http.js';

const authApi = { me: vi.fn(), login: vi.fn(), logout: vi.fn() };
vi.mock('../src/features/Auth/services/authApi.js', () => ({ authApi }));

const { useUnauthorizedNotice } =
  await import('../src/features/Auth/hooks/useUnauthorizedNotice.js');
const { sessionKey } = await import('../src/features/Auth/hooks/useSession.js');

async function failMutation(client: QueryClient, status: number) {
  await act(async () => {
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiError(status, 'x', [])) })
      .execute(undefined)
      .catch(() => undefined);
  });
}

async function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useUnauthorizedNotice(), { wrapper });
  await waitFor(() => {
    expect(client.getQueryData(sessionKey)).toEqual({ authenticated: true, username: 'admin' });
    expect(client.isFetching({ queryKey: sessionKey })).toBe(0);
  });
  return { client, ...hook };
}

beforeEach(() => {
  vi.clearAllMocks();
  authApi.me.mockResolvedValue({ authenticated: true, username: 'admin' });
});

describe('useUnauthorizedNotice', () => {
  it('stays hidden while the cached session still says admin, then shows once it is gone', async () => {
    const { client, result } = await setup();
    let release: () => void = () => undefined;
    authApi.me.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ authenticated: false });
      }),
    );

    await failMutation(client, 401);
    // The refetch is still pending: the cached session says admin, the notice is not shown yet.
    expect(result.current.expired).toBe(false);

    act(() => release());
    await waitFor(() => expect(client.getQueryData(sessionKey)).toEqual({ authenticated: false }));
    await waitFor(() => expect(result.current.expired).toBe(true));
  });

  it('logging in again after expiry clears the notice', async () => {
    const { client, result } = await setup();
    authApi.me.mockResolvedValue({ authenticated: false });
    await failMutation(client, 401);
    await waitFor(() => expect(result.current.expired).toBe(true));

    authApi.me.mockResolvedValue({ authenticated: true, username: 'admin' });
    await act(async () => {
      await client.invalidateQueries({ queryKey: sessionKey });
    });
    await waitFor(() => expect(result.current.expired).toBe(false));

    authApi.me.mockResolvedValue({ authenticated: false });
    await act(async () => {
      await client.invalidateQueries({ queryKey: sessionKey });
    });
    // Admin gone again without a new 401: the old notice must not come back.
    expect(result.current.expired).toBe(false);
  });
});
