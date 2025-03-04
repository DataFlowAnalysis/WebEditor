import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['**/*.config.ts', 'node_modules/**', 'dist/**']
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
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
    }
  },
  {
    files: ['**/*.config.ts', '**/*.config.js', '**/*.d.ts'],
    rules: {
      'no-restricted-exports': 'off'
    }
  },
]