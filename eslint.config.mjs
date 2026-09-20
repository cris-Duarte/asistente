import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/build/**', '**/coverage/**', 'packages/ai-agent/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        Buffer: 'readonly', console: 'readonly', crypto: 'readonly', fetch: 'readonly',
        navigator: 'readonly', window: 'readonly', document: 'readonly', Notification: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', process: 'readonly', TextEncoder: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'eqeqeq': ['error', 'always'],
    },
  },
];
