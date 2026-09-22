import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import e18e from '@e18e/eslint-plugin';
import globals from 'globals';
import vitest from '@vitest/eslint-plugin';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // e18e (ecosystem performance): modernisation, module-replacement and
  // performance rules. Recommended set, applied to every workspace.
  e18e.configs.recommended,
  {
    rules: {
      // e18e/prefer-spread-syntax covers everything core prefer-spread does
      // (and more), so the core rule would only duplicate its reports.
      'prefer-spread': 'off',
      // Express is a deliberate choice for this project; e18e's suggested
      // replacement (h3) is a framework migration, not a lint fix.
      'e18e/ban-dependencies': ['error', { allowed: ['express'] }],
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      // AGENT.md: no console in production code — use the logger.
      'no-console': 'error',
      // AGENT.md: no `any` without a documented eslint-disable.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // AGENT.md: async/await everywhere, no floating promises.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    // The logger is the one module allowed to touch the console.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
    plugins: { vitest },
    rules: {
      // AGENT.md prohibits .only / .skip in committed code — enforce it rather
      // than trusting review. A skipped test is a test that silently stopped
      // running, which is worse than no test at all.
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-commented-out-tests': 'error',
      'vitest/expect-expect': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/valid-expect': 'error',
      'vitest/no-standalone-expect': 'error',

      // A test runs once; hoisting `getByRole('button', { name: /save/i })`
      // patterns to module scope would hurt readability for no gain.
      'e18e/prefer-static-regex': 'off',

      // Supertest response bodies are `any` by nature.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  // Config files live outside the TS project — lint them untyped.
  {
    files: ['eslint.config.js', '*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
