module.exports = {
  extends: ['./src/ambire-common/.eslintrc.js'],
  rules: {
    'import/extensions': 'off',
    'class-methods-use-this': 'off',
    'no-nested-ternary': 'off',
    'prefer-promise-reject-errors': 'off',
    'no-underscore-dangle': 'off',
    'react/jsx-key': 'error'
  },
  env: {
    browser: true,
    node: true,
    jest: true
  },
  parserOptions: {
    project: './tsconfig.json'
  },
  globals: {
    process: 'readonly',
    chrome: 'readonly',
    injectWeb3: 'readonly',
    browser: 'readonly',
    __dirname: 'readonly',
    chromeTargetConfig: 'writable',
    firefoxTargetConfig: 'writable',
    Web3: true
  },
  overrides: [
    {
      // Account recovery: only shared/client imports the SDK's runtime; every folder may import its types.
      // Tests and fixtures may use the SDK's encoders to build their records.
      files: ['src/web/modules/social-recovery/**/*.{ts,tsx,js,jsx}'],
      excludedFiles: [
        'src/web/modules/social-recovery/shared/client/**',
        'src/web/modules/social-recovery/**/__tests__/**',
        'src/web/modules/social-recovery/**/__fixtures__/**'
      ],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@kohaku-eth/social-recovery'],
                allowTypeImports: true,
                message:
                  "Import the SDK's runtime through @web/modules/social-recovery/shared/client; type imports are fine."
              }
            ]
          }
        ]
      }
    },
    {
      // Account recovery: every branch and loop body has braces.
      files: ['src/web/modules/social-recovery/**/*.{ts,tsx,js,jsx}'],
      rules: {
        curly: ['error', 'all']
      }
    }
  ]
}
