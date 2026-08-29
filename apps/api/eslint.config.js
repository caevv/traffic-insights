import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { 'unused-imports': unusedImports },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
      // Pinned explicitly: the pre-commit hook lints files from BOTH
      // workspaces in a single run from the repo root, and typescript-eslint
      // cannot choose between two candidate roots on its own. Without this,
      // every file fails to parse depending on where eslint was invoked.
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      // Every SQL string in this codebase is a parameterised query. Template
      // literals that interpolate user input into SQL are a bug, not a style.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(query|one|many)$/] > TemplateLiteral[expressions.length>0]',
          message:
            'Do not interpolate values into SQL. Use $1/$2 placeholders and pass a values array.',
        },
      ],
    },
  },
  prettier,
])
