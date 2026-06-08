import { describe, expect, it } from 'vitest'
import { PDVContext } from './pdvContext'
import { makeOptions, makeSnapshot } from './testHelpers'
import { validatePdvState } from './validatePdvState'

describe('validatePdvState', () => {
  it('snapshot válido em strict retorna ok', () => {
    const result = validatePdvState(makeSnapshot(), makeOptions({ mode: 'strict' }))
    expect(result.ok).toBe(true)
    expect(result.meta.severitySummary).toBe('all-ok')
  })

  it('ok deriva exclusivamente de violations.error', () => {
    const snapshot = makeSnapshot({
      vendas: [
        {
          id: 'venda-1',
          caixa_id: 'caixa-1',
          status: 'CONCLUIDA',
          total_liquido: 99,
          forma_pagamento: 'DINHEIRO',
        },
      ],
    })
    const result = validatePdvState(
      snapshot,
      makeOptions({ mode: 'observational', invariantAssert: false }),
    )
    const hasError = result.violations.some((v) => v.severity === 'error')
    expect(result.ok).toBe(!hasError)
  })

  it('invariant crítico falha em observational', () => {
    const snapshot = makeSnapshot({
      caixa: {
        ...makeSnapshot().caixa,
        operador_id: null,
      },
    })
    const result = validatePdvState(
      snapshot,
      makeOptions({ mode: 'observational', context: PDVContext.CAIXA_CLOSE }),
    )
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.code === 'CAIXA_INCONSISTENT')).toBe(true)
  })

  it('meta.severitySummary não altera ok', () => {
    const snapshot = makeSnapshot({
      vendas: [
        {
          id: 'venda-1',
          caixa_id: 'caixa-1',
          status: 'CONCLUIDA',
          total_liquido: 99,
          forma_pagamento: 'DINHEIRO',
        },
      ],
    })
    const result = validatePdvState(
      snapshot,
      makeOptions({ mode: 'observational', invariantAssert: false }),
    )
    expect(result.ok).toBe(true)
    expect(result.meta.severitySummary).toBe('warnings')
    result.meta.severitySummary = 'errors'
    expect(result.ok).toBe(true)
  })

  it('invariantAssert escala warning para error', () => {
    const snapshot = makeSnapshot({
      vendas: [
        {
          id: 'venda-1',
          caixa_id: 'caixa-1',
          status: 'CONCLUIDA',
          total_liquido: 99,
          forma_pagamento: 'DINHEIRO',
        },
      ],
    })
    const result = validatePdvState(
      snapshot,
      makeOptions({ mode: 'observational', invariantAssert: true }),
    )
    expect(result.ok).toBe(false)
    expect(result.meta.severitySummary).toBe('errors')
  })
})
