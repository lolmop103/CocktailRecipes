import { z } from 'zod';

/**
 * Environment contract, validated once at startup (AGENT.md § Env vars).
 * Importing this module in an invalid environment fails fast and loudly
 * rather than surfacing as a confusing runtime error later.
 */
/** `scrypt$<N>$<r>$<p>$<salt>$<key>`, as printed by `npm run hash-password`. */
const PASSWORD_HASH = /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/;
const ADMIN_VARIABLES = ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH'] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
    DATA_DIR: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ADMIN_USERNAME: z.string().min(1).max(64).optional(),
    ADMIN_PASSWORD_HASH: z
      .string()
      .regex(PASSWORD_HASH, 'must be a hash from `npm run hash-password`')
      .optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Proxies in front of the app (the owner's Caddy is one); decides which client IP is trusted. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  })
  .superRefine((value, ctx) => {
    // A production server must never start with editing open to everyone.
    if (value.NODE_ENV !== 'production') return;
    for (const name of ADMIN_VARIABLES) {
      if (value[name] === undefined) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'is required in production' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

export const env: Env = load();
