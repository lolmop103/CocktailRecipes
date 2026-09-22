import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import e18e from '@e18e/eslint-plugin';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

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
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
