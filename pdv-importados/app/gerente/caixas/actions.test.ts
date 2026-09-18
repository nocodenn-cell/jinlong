import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S9/G-01 — Server Actions de histórico de caixa. Mesmo padrão de mock de
 * `gerente/compras/listarOrdensCompraElegiveisParaVinculo.test.ts`: um
 * builder encadeável e thenable por tabela.
 */

const assertAdminSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/admin/auth/assertAdminSession', () => ({ assertAdminSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

import { listarHistoricoCaixas, listarMovimentacoesCaixa } from './actions'

function sessionOk(lojaId: string | null = 'loja-a') {
  return { ok: true, session: { lojaId, idioma: 'pt', userId: 'u1' } } as const
}

type CaixasQueryBuilder = {
  select: (cols: string) => CaixasQueryBuilder
  eq: (col: string, val: string) => CaixasQueryBuilder
  order: (col: string, opts: unknown) => CaixasQueryBuilder
  limit: (n: number) => CaixasQueryBuilder
  is: (col: string, val: unknown) => CaixasQueryBuilder
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  then: (resolve: (v: { data: unknown; error: unknown }) => void) => void
}

function buildFromMock(resultsByTable: Record<string, { data: unknown; error: unknown }>) {
  return (table: string) => {
    let lojaFiltrada: string | null = null
    const builder: CaixasQueryBuilder = {
      select: () => builder,
      eq: (col, val) => {
        if (col === 'loja_id') lojaFiltrada = val
        return builder
      },
      order: () => builder,
      limit: () => builder,
      is: () => builder,
      maybeSingle: async () => resultsByTable[`${table}:maybeSingle`] ?? { data: null, error: null },
      then: (resolve) => {
        resolve(resultsByTable[table] ?? { data: [], error: null })
      },
    }
    void lojaFiltrada
    return builder
  }
}

describe('listarHistoricoCaixas (S9/G-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertAdminSession.mockResolvedValue(sessionOk())
  })

  it('mapeia as linhas retornadas pela query (caixas FECHADO da loja)', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({
        caixas: {
          data: [
            {
              id: 'c1',
              operador_id: 'op1',
              data_abertura: '2026-09-17T10:00:00Z',
              data_fechamento: '2026-09-17T18:00:00Z',
              valor_inicial: 100,
              valor_fechamento: 160,
              fechamento_diferenca: 0,
              fechamento_observacao: null,
              operador: { nome: 'Maria' },
            },
          ],
          error: null,
        },
      }),
    })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toHaveLength(1)
      expect(res.data[0].operadorNome).toBe('Maria')
      expect(res.data[0].valorSistema).toBe(160)
    }
  })

  it('sem sessão válida, recusa (fail closed)', async () => {
    assertAdminSession.mockResolvedValue({ ok: false, error: 'Não autorizado.' })
    createClient.mockResolvedValue({ from: buildFromMock({}) })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(false)
  })

  it('erro de consulta retorna falha, não lista vazia disfarçada de sucesso', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: null, error: { message: 'timeout' } } }),
    })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(false)
  })
})

describe('listarMovimentacoesCaixa (S9/G-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertAdminSession.mockResolvedValue(sessionOk())
  })

  it('confirma o caixa na loja antes de listar movimentações', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({
        'caixas:maybeSingle': { data: { id: 'c1' }, error: null },
        movimentacoes_caixa: {
          data: [
            {
              id: 'm1',
              tipo: 'SANGRIA',
              valor: 50,
              motivo: 'Pagamento fornecedor',
              status: 'aprovada',
              created_at: '2026-09-17T12:00:00Z',
            },
          ],
          error: null,
        },
      }),
    })

    const res = await listarMovimentacoesCaixa('c1')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toHaveLength(1)
      expect(res.data[0].tipo).toBe('SANGRIA')
    }
  })

  it('caixa não encontrado na loja do ator → recusa, não vaza movimentação de outra loja', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({
        'caixas:maybeSingle': { data: null, error: null },
      }),
    })

    const res = await listarMovimentacoesCaixa('c-de-outra-loja')
    expect(res.ok).toBe(false)
  })
})
