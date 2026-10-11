import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['**/node_modules/', '**/dist/', 'server/data/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Очистка текста от управляющих символов (/[\u0000-\u001F]/) — намеренная.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['server/**/*.js', 'client/test/**/*.js', 'client/vite.config.js', '*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
]
