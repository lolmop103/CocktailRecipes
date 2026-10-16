import { describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from './testUtils.js';
import { SessionExpiredBanner } from '../src/features/Auth/components/SessionExpiredBanner.js';
import { ApiError } from '../src/lib/http.js';

describe('SessionExpiredBanner', () => {
  it('SessionExpiredBanner_after401Mutation_showsLoginLink', async () => {
    const { queryClient } = renderWithProviders(<SessionExpiredBanner />, { route: '/mocktails' });

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(new ApiError(401, 'Log in to make changes', [])),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(await screen.findByText('Your session has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in again' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fmocktails',
    );
  });

  it('SessionExpiredBanner_dismiss_hides', async () => {
    const { queryClient } = renderWithProviders(<SessionExpiredBanner />);
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(new ApiError(401, 'x', [])) })
      .execute(undefined)
      .catch(() => undefined);
    await screen.findByText('Your session has expired.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument();
  });

  it('SessionExpiredBanner_otherErrors_staysHidden', async () => {
    const { queryClient } = renderWithProviders(<SessionExpiredBanner />);

    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(new ApiError(500, 'x', [])) })
      .execute(undefined)
      .catch(() => undefined);

    expect(screen.queryByText('Your session has expired.')).not.toBeInTheDocument();
  });
});
