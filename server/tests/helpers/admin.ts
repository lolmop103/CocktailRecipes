/**
 * Test-only admin credentials. The hash uses a deliberately low scrypt cost
 * (N=1024) so logins in tests are fast; production hashes come from
 * `npm run hash-password` with the full cost. Never use these anywhere else.
 */
export const TEST_ADMIN = { username: 'admin', password: 'test-admin-password' } as const;

export const TEST_ADMIN_PASSWORD_HASH =
  'scrypt$1024$8$1$Y29ja3RhaWwtdGVzdC1zYWx0$SrCe7cQgqgEmwhEu4/R56wDLexjTLseaW2nJIWA78e0qu6feX2AcMaLgvRY6NqW4Mi2PMw9HRvKPTN9lYuaIQA==';
