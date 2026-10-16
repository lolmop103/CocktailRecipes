import type { SessionInfo } from '@cocktail/shared';
import { jsonInit, request } from '@/lib/http.js';

const BASE = '/api/auth';

export const authApi = {
  me(): Promise<SessionInfo> {
    return request<SessionInfo>(`${BASE}/me`);
  },

  login(username: string, password: string): Promise<void> {
    return request<void>(`${BASE}/login`, jsonInit('POST', { username, password }));
  },

  logout(): Promise<void> {
    return request<void>(`${BASE}/logout`, { method: 'POST' });
  },
};
