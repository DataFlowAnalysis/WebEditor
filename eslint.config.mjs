import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['node_modules/**', 'dist/**']
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
            jsx: true
        }
      }
    },
    rules: {
      'no-console': 'error',
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
      // used multiple times to stay consistent with sprotty
      '@typescript-eslint/no-namespace': 'off',
    }
  },
  {
    files: ['**/*.config.ts', '**/*.config.js', '**/*.d.ts'],
    rules: {
      'no-restricted-exports': 'off'
    }
  },
]