if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const boundariesPlugin = require('eslint-plugin-boundaries');
const prettierConfig = require('eslint-config-prettier');

// WHISPR-103: classify every source path into an architectural element.
// Order matters — most specific patterns first. The matrix is intentionally
// permissive (everything may import everything) and rules are `warn`: this PR
// only lands the classification. WHISPR-401 tightens it to strict `error`.
// See docs/architecture/feature-first.md.
const boundariesElements = [
  // Target feature-first layers (capture the feature name).
  { type: 'feature-ui', pattern: 'src/features/*/ui', capture: ['feature'] },
  {
    type: 'feature-application',
    pattern: 'src/features/*/application',
    capture: ['feature'],
  },
  {
    type: 'feature-domain',
    pattern: 'src/features/*/domain',
    capture: ['feature'],
  },
  { type: 'feature-data', pattern: 'src/features/*/data', capture: ['feature'] },
  // expo-router file-based routes (future).
  { type: 'app', pattern: 'src/app' },
  // Shared, cross-feature.
  { type: 'shared', pattern: 'src/shared' },
  // Legacy roots — tolerated during migration, removed feature-by-feature.
  { type: 'legacy-screens', pattern: 'src/screens' },
  { type: 'legacy-store', pattern: 'src/store' },
  { type: 'legacy-services', pattern: 'src/services' },
  { type: 'legacy-components', pattern: 'src/components' },
  { type: 'legacy-context', pattern: 'src/context' },
  { type: 'legacy-hooks', pattern: 'src/hooks' },
  { type: 'legacy-providers', pattern: 'src/providers' },
  { type: 'legacy-navigation', pattern: 'src/navigation' },
  { type: 'legacy-lib', pattern: 'src/lib' },
  { type: 'legacy-misc', pattern: 'src/*' },
];

module.exports = [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
      boundaries: boundariesPlugin,
    },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': boundariesElements,
    },
    rules: {
      // Permissive matrix: every element may import every element (for now).
      'boundaries/dependencies': [
        'warn',
        {
          default: 'allow',
          // v6.0.2 expects string selectors here; the plugin still logs a
          // "legacy selector" hint but object selectors are rejected by the
          // schema. Strict matrix in WHISPR-401 will use the supported form.
          rules: [{ from: ['*'], allow: ['*'] }],
        },
      ],
      // Don't nag about files that don't match an element yet.
      'boundaries/no-unknown': 'off',
      'boundaries/no-unknown-files': 'off',
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    files: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  prettierConfig,
];
