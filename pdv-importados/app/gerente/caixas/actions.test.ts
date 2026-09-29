import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S9/G-01 — Server Actions de histórico de caixa. Mesmo padrão de mock de
 * `gerente/compras/listarOrdensCompraElegiveisParaVinculo.test.ts`: um
 * builder encadeável e thenable por tabela.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

import { listarHistoricoCaixas, listarMovimentacoesCaixa } from './actions'

type Perfil = 'GERENTE' | 'DONO' | 'ADMIN'

function sessionOk(perfil: Perfil = 'GERENTE', lojaId: string | null = 'loja-a') {
  return { ok: true, session: { perfil, lojaId, idioma: 'pt', userId: 'u1' } } as const
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

function buildFromMock(
  resultsByTable: Record<string, { data: unknown; error: unknown }>,
  onLojaFiltrada?: (table: string, lojaId: string) => void,
) {
  return (table: string) => {
    const builder: CaixasQueryBuilder = {
      select: () => builder,
      eq: (col, val) => {
        if (col === 'loja_id') onLojaFiltrada?.(table, val)
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
    return builder
  }
}

describe('listarHistoricoCaixas (S9/G-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk())
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
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Não autorizado.' })
    createClient.mockResolvedValue({ from: buildFromMock({}) })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(false)
  })

  it('perfil não autorizado (ex.: OPERADOR) → assertGerenteSession recusa, ação não executa query', async () => {
    assertGerenteSession.mockResolvedValue({
      ok: false,
      error: 'Esta área é só para gerente, dono ou administrador. Use uma conta com permissão.',
    })
    const fromSpy = vi.fn()
    createClient.mockResolvedValue({ from: fromSpy })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(false)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('erro de consulta retorna falha, não lista vazia disfarçada de sucesso', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: null, error: { message: 'timeout' } } }),
    })

    const res = await listarHistoricoCaixas()
    expect(res.ok).toBe(false)
  })

  describe('escopo de loja por perfil (achado da certificação pré-go-live)', () => {
    it('GERENTE: filtra por loja_id = loja da própria sessão', async () => {
      assertGerenteSession.mockResolvedValue(sessionOk('GERENTE', 'loja-gerente'))
      const lojasFiltradas: string[] = []
      createClient.mockResolvedValue({
        from: buildFromMock({ caixas: { data: [], error: null } }, (_table, lojaId) => {
          lojasFiltradas.push(lojaId)
        }),
      })

      const res = await listarHistoricoCaixas()
      expect(res.ok).toBe(true)
      expect(lojasFiltradas).toEqual(['loja-gerente'])
    })

    it('ADMIN: filtra por loja_id = loja da própria sessão (mesma regra do GERENTE, RLS 057)', async () => {
      assertGerenteSession.mockResolvedValue(sessionOk('ADMIN', 'loja-admin'))
      const lojasFiltradas: string[] = []
      createClient.mockResolvedValue({
        from: buildFromMock({ caixas: { data: [], error: null } }, (_table, lojaId) => {
          lojasFiltradas.push(lojaId)
        }),
      })

      const res = await listarHistoricoCaixas()
      expect(res.ok).toBe(true)
      expect(lojasFiltradas).toEqual(['loja-admin'])
    })

    it('DONO: NÃO filtra por loja_id — vê todas as lojas (RLS 057 permite; app não deve sub-restringir)', async () => {
      assertGerenteSession.mockResolvedValue(sessionOk('DONO', 'loja-do-dono'))
      const lojasFiltradas: string[] = []
      createClient.mockResolvedValue({
        from: buildFromMock({ caixas: { data: [], error: null } }, (_table, lojaId) => {
          lojasFiltradas.push(lojaId)
        }),
      })

      const res = await listarHistoricoCaixas()
      expect(res.ok).toBe(true)
      expect(lojasFiltradas).toEqual([])
    })

    it('DONO sem loja_id na sessão: também não filtra (continua global, não cai no fallback da matriz)', async () => {
      assertGerenteSession.mockResolvedValue(sessionOk('DONO', null))
      const lojasFiltradas: string[] = []
      createClient.mockResolvedValue({
        from: buildFromMock({ caixas: { data: [], error: null } }, (_table, lojaId) => {
          lojasFiltradas.push(lojaId)
        }),
      })

      const res = await listarHistoricoCaixas()
      expect(res.ok).toBe(true)
      expect(lojasFiltradas).toEqual([])
    })
  })
})

describe('listarMovimentacoesCaixa (S9/G-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk())
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

  it('DONO: confirma o caixa sem filtrar por loja_id (vê movimentações de qualquer loja)', async () => {
    assertGerenteSession.mockResolvedValue(sessionOk('DONO', 'loja-do-dono'))
    const lojasFiltradas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock(
        {
          'caixas:maybeSingle': { data: { id: 'c1' }, error: null },
          movimentacoes_caixa: { data: [], error: null },
        },
        (_table, lojaId) => {
          lojasFiltradas.push(lojaId)
        },
      ),
    })

    const res = await listarMovimentacoesCaixa('c1')
    expect(res.ok).toBe(true)
    expect(lojasFiltradas).toEqual([])
  })

  it('inclui recebimentos/estornos de contas a receber (liquidacoes_receber) mesclados por data', async () => {
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
        liquidacoes_receber: {
          data: [
            {
              id: 'l1',
              valor: '30.00',
              operacao_tipo: 'RECEBIMENTO',
              created_at: '2026-09-17T11:00:00Z',
            },
            {
              id: 'l2',
              valor: '10.00',
              operacao_tipo: 'ESTORNO',
              created_at: '2026-09-17T13:00:00Z',
            },
          ],
          error: null,
        },
      }),
    })

    const res = await listarMovimentacoesCaixa('c1')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // Ordenado por criadaEm: liquidação (11h) → sangria (12h) → estorno (13h)
    expect(res.data.map((r) => r.id)).toEqual(['l1', 'm1', 'l2'])
    expect(res.data[0].valor).toBe(30)
    expect(res.data[0].tipo).toBe('Recebimento (conta a receber)')
    expect(res.data[2].valor).toBe(10) // sempre positivo, direção via tipo/motivo
    expect(res.data[2].tipo).toBe('Estorno de recebimento')
  })

  it('falha ao ler liquidacoes_receber não impede o extrato principal (sem lógica financeira paralela)', async () => {
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
        liquidacoes_receber: { data: null, error: { message: 'boom' } },
      }),
    })

    const res = await listarMovimentacoesCaixa('c1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual([expect.objectContaining({ id: 'm1' })])
  })
})
