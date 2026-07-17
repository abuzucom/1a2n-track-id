import tseslint from 'typescript-eslint';

export default tseslint.config(
  // traktor-mod is QML-side vendored code executed by Traktor's Qt engine, not this project's JS.
  { ignores: ['dist/**', 'public/overlay.js', 'node_modules/**', 'traktor-mod/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'off',
    },
  },
);
