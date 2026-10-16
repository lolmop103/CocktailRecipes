import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
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
