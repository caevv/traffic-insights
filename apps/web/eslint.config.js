import js from '@eslint/js'
import globals from 'globals'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import unusedImports from 'eslint-plugin-unused-imports'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'unused-imports': unusedImports,
      boundaries,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      // Set on purpose. The pre-commit hook lints files from BOTH workspaces
      // in one run from the repo root, and typescript-eslint can't pick
      // between two roots by itself. Without this, files fail to parse
      // depending on where eslint was run from.
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**', partialMatch: false },
        {
          type: 'feature',
          pattern: 'src/features/*/**',
          partialMatch: false,
          capture: ['feature'],
        },
        { type: 'shared', pattern: 'src/shared/**', partialMatch: false },
      ],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: [{ element: { type: 'app' } }],
              allow: [
                { to: { element: { type: ['app', 'feature', 'shared'] } } },
              ],
            },
            {
              from: [{ element: { type: 'feature' } }],
              allow: [
                { to: { element: { type: 'shared' } } },
                {
                  to: {
                    element: {
                      type: 'feature',
                      captured: { feature: '{{from.captured.feature}}' },
                    },
                  },
                },
              ],
            },
            {
              from: [{ element: { type: 'shared' } }],
              allow: [{ to: { element: { type: 'shared' } } }],
            },
          ],
        },
      ],
    },
  },
  prettier,
])
