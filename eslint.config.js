import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'web-dist/**',
      'site-dist/**',
      '.tanstack/**',
      'coverage/**',
      'node_modules/**',
      'web/routeTree.gen.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['scripts/discovery/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
