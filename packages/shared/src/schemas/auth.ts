import { z } from 'zod';

/** Body of `POST /api/auth/login`. Bounded so a login attempt has a fixed cost. */
export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Body of `GET /api/auth/me`. */
export interface SessionInfo {
  authenticated: boolean;
  username?: string;
}

export type LoginInput = z.infer<typeof loginSchema>;
