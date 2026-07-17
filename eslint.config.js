import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'public/overlay.js', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'off',
    },
  },
);
