import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys as recipeKeys } from '@/features/Recipes/hooks/useRecipeQueries.js';
import { authApi } from '../services/authApi.js';

export const sessionKey = ['session'] as const;

/** Whether the visitor is the logged-in admin. */
export function useSession() {
  const query = useQuery({ queryKey: sessionKey, queryFn: () => authApi.me() });
  return {
    isAdmin: query.data?.authenticated === true,
    username: query.data?.username,
    isPending: query.isPending,
  };
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: sessionKey }),
        client.invalidateQueries({ queryKey: recipeKeys.allRecipes }),
      ]);
    },
  });
}

const useEndSession = (end: () => Promise<void>) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: end,
    onSuccess: async () => {
      client.setQueryData(sessionKey, { authenticated: false });
      await client.invalidateQueries({ queryKey: sessionKey });
    },
  });
};

export function useLogout() {
  return useEndSession(() => authApi.logout());
}

export function useLogoutAll() {
  return useEndSession(() => authApi.logoutAll());
}
