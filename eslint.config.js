import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'assets/**', 'tools/**', 'js/navigation.test.js'] },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
