import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDVContext } from '../../../shared-core/src/pdv/invariants'

vi.mock('./fetchPdvStateSnapshot.internal', () => ({
  fetchPdvStateSnapshot: vi.fn(),
}))

vi.mock('../../../shared-core/src/pdv/invariants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared-core/src/pdv/invariants')>()
  return {
    ...actual,
    validatePdvState: vi.fn(),
  }
})

import { validatePdvState } from '../../../shared-core/src/pdv/invariants'
import { fetchPdvStateSnapshot } from './fetchPdvStateSnapshot.internal'
import { runPdvEvaluation } from './runPdvEvaluation'

const mockFetch = vi.mocked(fetchPdvStateSnapshot)
const mockValidate = vi.mocked(validatePdvState)

describe('runPdvEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetch_failed não chama validatePdvState nem produz validation', async () => {
    mockFetch.mockResolvedValue(null)

    const outcome = await runPdvEvaluation('caixa-x', PDVContext.TEST)

    expect(outcome.kind).toBe('fetch_failed')
    if (outcome.kind === 'fetch_failed') {
      expect(outcome.code).toBe('CAIXA_NOT_FOUND')
      expect('validation' in outcome).toBe(false)
    }
    expect(mockValidate).not.toHaveBeenCalled()
  })

  it('snapshot válido retorna validated', async () => {
    const snapshot = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      caixaVersion: 1,
      caixa: {
        id: 'c1',
        operador_id: 'o1',
        loja_id: 'l1',
        status: 'FECHADO',
        valor_inicial: 0,
        valor_fechamento: 0,
        fechamento_diferenca: 0,
        fechamento_observacao: null,
        data_abertura: '2026-01-01T00:00:00.000Z',
        data_fechamento: '2026-01-01T01:00:00.000Z',
      },
      vendas: [],
      itensPorVenda: {},
      valorSistemaCalculado: 0,
    }
    mockFetch.mockResolvedValue(snapshot)
    mockValidate.mockReturnValue({
      ok: true,
      mode: 'strict',
      context: PDVContext.TEST,
      invariantAssert: false,
      violations: [],
      meta: { severitySummary: 'all-ok' },
    })

    const outcome = await runPdvEvaluation('c1', PDVContext.TEST)

    expect(outcome.kind).toBe('validated')
    expect(mockValidate).toHaveBeenCalledOnce()
  })
})
