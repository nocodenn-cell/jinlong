import assert from 'node:assert/strict'
import test from 'node:test'

import { EXPECTED, evaluate } from './verify-venda-finance-context-catalog.mjs'

test('estado canônico exige ausência de todos os objetos aposentados', () => {
  assert.deepEqual(Object.values(EXPECTED), Array(Object.keys(EXPECTED).length).fill(false))
  const result = evaluate({ ...EXPECTED })
  assert.equal(result.allOk, true)
  assert.equal(Object.values(result.checks).every((check) => check.ok), true)
})

test('qualquer objeto residual impede a convergência', () => {
  for (const key of Object.keys(EXPECTED)) {
    const catalog = { ...EXPECTED, [key]: true }
    const result = evaluate(catalog)
    assert.equal(result.allOk, false, key)
    assert.equal(result.checks[key].ok, false, key)
  }
})
