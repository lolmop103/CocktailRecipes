import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Test-only admin credentials (see tests/helpers/admin.ts); the hash is cheap on purpose.
    env: {
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD_HASH:
        'scrypt$1024$8$1$Y29ja3RhaWwtdGVzdC1zYWx0$SrCe7cQgqgEmwhEu4/R56wDLexjTLseaW2nJIWA78e0qu6feX2AcMaLgvRY6NqW4Mi2PMw9HRvKPTN9lYuaIQA==',
    },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/scripts/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
