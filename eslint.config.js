const expoConfig = require('eslint-config-expo/flat')

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'supabase/functions/**'],
  },
  {
    rules: {
      // useRef(new Animated.Value(...)).current is the standard RN idiom for a
      // stable mutable animation driver; it isn't render-derived state.
      'react-hooks/refs': 'off',
      // React Compiler-targeted rules; this app doesn't opt into the compiler.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    files: ['**/*.test.js', '**/*.test.jsx', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
]
