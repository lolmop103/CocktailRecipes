import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from './testUtils.js';
import { ApiError } from '../src/lib/http.js';

const authApi = { me: vi.fn(), login: vi.fn(), logout: vi.fn() };
vi.mock('../src/features/Auth/services/authApi.js', () => ({ authApi }));

const { SessionExpiredBanner } =
  await import('../src/features/Auth/components/SessionExpiredBanner.js');
const { sessionKey } = await import('../src/features/Auth/hooks/useSession.js');

/** Runs a mutation that fails with the given status, as a write refused by the API. */
async function failMutation(client: QueryClient, status: number) {
  await act(async () => {
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiError(status, 'x', [])) })
      .execute(undefined)
      .catch(() => undefined);
  });
}

async function renderAsAdmin(route?: string) {
  const view = renderWithProviders(<SessionExpiredBanner />, route ? { route } : {});
  await act(async () => {
    await view.queryClient.fetchQuery({
      queryKey: sessionKey,
      queryFn: () => authApi.me() as Promise<unknown>,
    });
  });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  authApi.me.mockResolvedValue({ authenticated: true, username: 'admin' });
});

describe('SessionExpiredBanner', () => {
  it('SessionExpiredBanner_after401Mutation_showsLoginLink', async () => {
    const { queryClient } = await renderAsAdmin('/mocktails');
    authApi.me.mockResolvedValue({ authenticated: false });

    await failMutation(queryClient, 401);

    expect(await screen.findByText('Your session has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in again' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fmocktails',
    );
  });

  it('SessionExpiredBanner_dismiss_hides', async () => {
    const { queryClient } = await renderAsAdmin();
    authApi.me.mockResolvedValue({ authenticated: false });
    await failMutation(queryClient, 401);
    await screen.findByText('Your session has expired.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument();
  });

  it('SessionExpiredBanner_otherErrors_staysHidden', async () => {
    const { queryClient } = await renderAsAdmin();

    await failMutation(queryClient, 500);

    expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument();
  });

  it('SessionExpiredBanner_wrongPasswordAsVisitor_staysHidden', async () => {
    authApi.me.mockResolvedValue({ authenticated: false });
    const { queryClient } = await renderAsAdmin();

    await failMutation(queryClient, 401);

    expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument();
  });

  it('SessionExpiredBanner_loggedInAgain_hides', async () => {
    const { queryClient } = await renderAsAdmin();
    authApi.me.mockResolvedValue({ authenticated: false });
    await failMutation(queryClient, 401);
    await screen.findByText('Your session has expired.');

    authApi.me.mockResolvedValue({ authenticated: true, username: 'admin' });
    act(() => {
      queryClient.setQueryData(sessionKey, { authenticated: true, username: 'admin' });
    });

    await waitFor(() =>
      expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument(),
    );
  });
});
