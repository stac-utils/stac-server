/* eslint-disable */

module.exports = {
  env: {
    browser: true,
    es6: true,
  },

  parserOptions: {
    ecmaVersion: 9,
  },

  rules: {
    'import/no-named-default': 'off',
    'no-warning-comments': [
      'warn',
      {
        terms: ['todo', 'fixme'],
        location: 'start',
      },
    ],
    'comma-dangle': [
      'error',
      {
        arrays: 'never',
        objects: 'only-multiline',
        imports: 'only-multiline',
        exports: 'only-multiline',
        functions: 'only-multiline',
      },
    ],
    'space-before-function-paren': [
      'error',
      {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always',
      },
    ],
  },

  extends: ['standard'],
}

/* eslint-enable */
