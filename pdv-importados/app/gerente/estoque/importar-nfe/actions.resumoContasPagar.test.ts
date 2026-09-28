import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BP-E1 — `confirmar_importacao_nfe` gera uma conta a pagar por duplicata do XML,
 * mas a tela nunca dizia isso. Esta action só LÊ o que já existe em
 * `contas_pagar` para a importação, escopado pela loja da sessão.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))

import { obterResumoContasPagarImportacaoNfe } from './actions'

type Filtro = { col: string; val: unknown }

function mockContasPagar(rows: Array<Record<string, unknown>>, erro: string | null = null) {
  const capturado: { tabela: string | null; eq: Filtro[]; neq: Filtro[] } = {
    tabela: null,
    eq: [],
    neq: [],
  }
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      capturado.eq.push({ col, val })
      return builder
    },
    neq: (col: string, val: unknown) => {
      capturado.neq.push({ col, val })
      return builder
    },
    then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void) =>
      resolve(erro ? { data: null, error: { message: erro } } : { data: rows, error: null }),
  }
  createClient.mockResolvedValue({
    from: (tabela: string) => {
      capturado.tabela = tabela
      return builder
    },
  })
  return capturado
}

describe('obterResumoContasPagarImportacaoNfe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
  })

  it('soma as duplicatas geradas, informa o 1º vencimento e o fornecedor', async () => {
    const cap = mockContasPagar([
      { valor_total: '150.50', vencimento: '2026-10-30', fornecedor_id: 'forn-1' },
      { valor_total: 100, vencimento: '2026-09-30', fornecedor_id: 'forn-1' },
    ])

    const r = await obterResumoContasPagarImportacaoNfe('imp-1')

    expect(r).toEqual({
      success: true,
      data: {
        quantidade: 2,
        valor_total: 250.5,
        primeiro_vencimento: '2026-09-30',
        fornecedor_id: 'forn-1',
      },
    })
    expect(cap.tabela).toBe('contas_pagar')
  })

  it('escopa por importação e loja da sessão e ignora contas canceladas', async () => {
    const cap = mockContasPagar([])

    await obterResumoContasPagarImportacaoNfe('imp-1')

    expect(cap.eq).toEqual(
      expect.arrayContaining([
        { col: 'nfe_importacao_id', val: 'imp-1' },
        { col: 'loja_id', val: 'loja-a' },
      ]),
    )
    expect(cap.neq).toEqual([{ col: 'status', val: 'CANCELADO' }])
  })

  it('nota sem duplicatas: quantidade zero, sem vencimento e sem fornecedor (a UI não oferece link)', async () => {
    mockContasPagar([])

    const r = await obterResumoContasPagarImportacaoNfe('imp-sem-parcelas')

    expect(r).toEqual({
      success: true,
      data: { quantidade: 0, valor_total: 0, primeiro_vencimento: null, fornecedor_id: null },
    })
  })

  it('erro de consulta vira erro de action, sem quebrar', async () => {
    mockContasPagar([], 'falha de rede')

    const r = await obterResumoContasPagarImportacaoNfe('imp-1')

    expect(r.success).toBe(false)
  })

  it('sem sessão de gerente, nem consulta', async () => {
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Acesso negado.' })

    const r = await obterResumoContasPagarImportacaoNfe('imp-1')

    expect(r).toEqual({ success: false, error: 'Acesso negado.' })
    expect(createClient).not.toHaveBeenCalled()
  })
})
