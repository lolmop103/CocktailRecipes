import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';

/**
 * A client per test: retries off so failures surface immediately, and no shared
 * cache so tests cannot leak state into one another.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  route?: string;
  queryClient?: QueryClient;
}

/** Renders a component inside the providers the app supplies in production. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/cocktails', queryClient = createTestQueryClient() }: Options = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}
