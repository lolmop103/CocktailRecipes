import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient, renderWithProviders } from './testUtils.js';
import { ApiError } from '../src/lib/http.js';

const authApi = { me: vi.fn(), login: vi.fn(), logout: vi.fn() };
vi.mock('../src/features/Auth/services/authApi.js', () => ({ authApi }));

const { useSession } = await import('../src/features/Auth/hooks/useSession.js');
const { LoginPage } = await import('../src/features/Auth/LoginPage.js');
const { AuthHeaderButton } = await import('../src/features/Auth/components/AuthHeaderButton.js');

const Where = () => {
  const location = useLocation();
  return <p>{`at ${location.pathname}${location.search}`}</p>;
};

beforeEach(() => {
  vi.clearAllMocks();
  authApi.me.mockResolvedValue({ authenticated: false });
});

describe('useSession', () => {
  it('useSession_meAuthenticated_isAdminTrue', async () => {
    authApi.me.mockResolvedValue({ authenticated: true, username: 'admin' });
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(result.current.username).toBe('admin');
  });
});

describe('LoginPage', () => {
  const renderLogin = (route: string) =>
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Where />} />
      </Routes>,
      { route },
    );

  it('LoginPage_success_navigatesToReturnTo', async () => {
    authApi.login.mockResolvedValue(undefined);
    renderLogin('/login?returnTo=%2Fmocktails%3Fq%3Dmint');

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('at /mocktails?q=mint')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith('admin', 'secret-password');
  });

  it('LoginPage_401_showsAlert', async () => {
    authApi.login.mockRejectedValue(new ApiError(401, 'Wrong username or password', []));
    renderLogin('/login');

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
  });

  describe('429 cooldown', () => {
    const submit = () => {
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    };

    it('LoginPage_429WithRetryAfter_countsDownAndDisablesButton', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        authApi.login.mockRejectedValue(new ApiError(429, 'Too many attempts', [], 30));
        renderLogin('/login');
        submit();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Too many attempts');
        expect(alert).toHaveTextContent('try again in 30 s');
        expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(screen.getByRole('alert')).toHaveTextContent('try again in 20 s');

        await act(async () => {
          await vi.advanceTimersByTimeAsync(20_000);
        });
        expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
        expect(screen.getByRole('alert')).not.toHaveTextContent('try again in');
        expect(authApi.login).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('LoginPage_429WithoutRetryAfter_showsMessageAndKeepsButtonEnabled', async () => {
      authApi.login.mockRejectedValue(new ApiError(429, 'Slow down', [], undefined));
      renderLogin('/login');
      submit();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Slow down');
      expect(alert).not.toHaveTextContent('try again in');
      expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    });

    it('LoginPage_idleMinute_makesNoAuthCall', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderLogin('/login');
        const before = authApi.me.mock.calls.length;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(authApi.me.mock.calls.length).toBe(before);
        expect(authApi.login).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('AuthHeaderButton', () => {
  it('AuthHeaderButton_loggedOut_showsLoginLinkWithReturnTo', async () => {
    renderWithProviders(<AuthHeaderButton />, { route: '/mocktails?q=mint' });

    const link = await screen.findByRole('link', { name: 'Log in' });

    expect(link).toHaveAttribute('href', '/login?returnTo=%2Fmocktails%3Fq%3Dmint');
  });

  it('AuthHeaderButton_logout_callsApiAndShowsLoginAgain', async () => {
    authApi.me.mockResolvedValueOnce({ authenticated: true, username: 'admin' });
    authApi.logout.mockResolvedValue(undefined);
    renderWithProviders(<AuthHeaderButton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
});
