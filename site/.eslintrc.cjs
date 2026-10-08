/**
 * Reutiliza o ESLint já instalado pelo ERP (pdv-importados) para não alterar a
 * árvore de dependências do monorepo. Se o ERP atualizar o ESLint, revisar aqui.
 */
const nextConfigDir = '../pdv-importados/node_modules/eslint-config-next'

module.exports = {
  root: true,
  extends: [
    require.resolve(`${nextConfigDir}/core-web-vitals.js`),
    require.resolve(`${nextConfigDir}/typescript.js`),
  ],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: ['.next/', 'test-results/', 'playwright-report/', 'scripts/*.py', '.eslintrc.cjs', 'next-env.d.ts'],
}
