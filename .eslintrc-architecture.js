/**
 * ESLint configuration for Architecture Validation
 *
 * This file integrates custom architectural rules into ESLint.
 * Load this config with: eslint --config .eslintrc-architecture.js
 */

const customRules = require('./.eslintrc.custom-rules.js')

module.exports = {
  root: false, // Don't override other configs
  plugins: ['@stylistic'],
  overrides: [
    {
      files: ['shared-core/src/domain/product/**/*.ts', 'pdv-importados/**/*.ts'],
      rules: {
        // Custom architectural rules
        ...Object.entries(customRules.rules).reduce((acc, [name, rule]) => {
          acc[`architecture/${name}`] = 'error'
          return acc
        }, {}),

        // Standard rules for architecture validation
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/core/catalog/**'],
                from: '**/app/aplicacao/**',
                message:
                  'Application layer cannot import business logic from core/catalog. Use domain services instead.',
              },
              {
                group: ['**/core/services/**'],
                from: '**/app/aplicacao/**',
                message:
                  'Application layer must not import core services. Use shared-core domain services.',
              },
              {
                group: ['pdv-importados/**'],
                from: 'shared-core/**',
                message:
                  'shared-core cannot depend on pdv-importados (reverse dependency)',
              },
            ],
          },
        ],

        // Import organization rules
        'sort-imports': [
          'warn',
          {
            ignoreCase: true,
            ignoreDeclarationSort: true,
          },
        ],
      },
    },

    // Test files have relaxed rules
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'architecture/no-forbidden-layer-imports': 'off',
      },
    },
  ],
}
