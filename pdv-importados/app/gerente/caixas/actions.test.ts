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

import {
  listarCaixasAbertos,
  listarHistoricoCaixas,
  listarMovimentacoesCaixa,
  listarOperadoresCaixa,
  resumoCaixas,
} from './actions'
import { CAIXAS_FILTRO_VAZIO } from './caixasFiltros'

type Perfil = 'GERENTE' | 'DONO' | 'ADMIN'

function sessionOk(perfil: Perfil = 'GERENTE', lojaId: string | null = 'loja-a') {
  return { ok: true, session: { perfil, lojaId, idioma: 'pt', userId: 'u1' } } as const
}

type MockResult = { data: unknown; error: unknown; count?: number | null }

type CaixasQueryBuilder = {
  select: (cols: string, opts?: unknown) => CaixasQueryBuilder
  eq: (col: string, val: string) => CaixasQueryBuilder
  neq: (col: string, val: unknown) => CaixasQueryBuilder
  gte: (col: string, val: unknown) => CaixasQueryBuilder
  lte: (col: string, val: unknown) => CaixasQueryBuilder
  not: (col: string, op: string, val: unknown) => CaixasQueryBuilder
  or: (filters: string) => CaixasQueryBuilder
  in: (col: string, vals: unknown[]) => CaixasQueryBuilder
  order: (col: string, opts: unknown) => CaixasQueryBuilder
  limit: (n: number) => CaixasQueryBuilder
  range: (from: number, to: number) => CaixasQueryBuilder
  is: (col: string, val: unknown) => CaixasQueryBuilder
  maybeSingle: () => Promise<MockResult>
  then: (resolve: (v: MockResult) => void) => void
}

/** Registra cada chamada de filtro (`op:col`) por tabela, para asserções. */
type Chamadas = string[]

function buildFromMock(
  resultsByTable: Record<string, MockResult>,
  onLojaFiltrada?: (table: string, lojaId: string) => void,
  chamadas?: Chamadas,
) {
  return (table: string) => {
    chamadas?.push(`from:${table}`)
    const builder: CaixasQueryBuilder = {
      select: () => builder,
      eq: (col, val) => {
        chamadas?.push(`eq:${col}=${val}`)
        if (col === 'loja_id') onLojaFiltrada?.(table, val)
        return builder
      },
      neq: (col, val) => {
        chamadas?.push(`neq:${col}=${String(val)}`)
        return builder
      },
      gte: (col) => {
        chamadas?.push(`gte:${col}`)
        return builder
      },
      lte: (col) => {
        chamadas?.push(`lte:${col}`)
        return builder
      },
      not: (col, op) => {
        chamadas?.push(`not:${col}:${op}`)
        return builder
      },
      or: (filters) => {
        chamadas?.push(`or:${filters}`)
        return builder
      },
      in: (col, vals) => {
        chamadas?.push(`in:${col}=${vals.join(',')}`)
        return builder
      },
      order: () => builder,
      limit: () => builder,
      range: (from, to) => {
        chamadas?.push(`range:${from}-${to}`)
        return builder
      },
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
      expect(res.data.linhas).toHaveLength(1)
      expect(res.data.linhas[0].operadorNome).toBe('Maria')
      expect(res.data.linhas[0].valorSistema).toBe(160)
      expect(res.data.linhas[0].retomado).toBe(false)
      expect(res.data.hasMore).toBe(false)
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

describe('listarHistoricoCaixas — filtros e paginação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk())
  })

  const rawFechado = (id: string) => ({
    id,
    operador_id: 'op1',
    data_abertura: '2026-09-17T10:00:00Z',
    data_fechamento: '2026-09-17T18:00:00Z',
    valor_inicial: 100,
    valor_fechamento: 160,
    fechamento_diferenca: 0,
    fechamento_observacao: null,
    turno_anterior_id: null,
    motivo_retomada: null,
    operador: { nome: 'Maria' },
  })

  it('aplica período, operador e "somente com diferença" na query', async () => {
    const chamadas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: [], error: null } }, undefined, chamadas),
    })

    await listarHistoricoCaixas(
      { inicio: '2026-09-01T00:00:00Z', fim: '2026-09-30T23:59:59Z', status: 'divergencia', operadorId: 'op9' },
      1,
    )

    expect(chamadas).toEqual(
      expect.arrayContaining([
        'eq:status=FECHADO',
        'gte:data_fechamento',
        'lte:data_fechamento',
        'eq:operador_id=op9',
        'neq:fechamento_diferenca=0',
      ]),
    )
  })

  it('só lista FECHADO com fechamento completo, filtrando NA QUERY (paginação coerente)', async () => {
    const chamadas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: [], error: null } }, undefined, chamadas),
    })
    await listarHistoricoCaixas()
    expect(chamadas).toEqual(
      expect.arrayContaining([
        'not:data_fechamento:is',
        'not:valor_fechamento:is',
        'not:fechamento_diferenca:is',
      ]),
    )
  })

  it('filtro "retomado" usa turno_anterior_id não nulo', async () => {
    const chamadas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: [], error: null } }, undefined, chamadas),
    })

    await listarHistoricoCaixas({ ...CAIXAS_FILTRO_VAZIO, status: 'retomado' }, 1)
    expect(chamadas).toContain('or:turno_anterior_id.not.is.null')
  })

  it('pagina por cursor: pede PAGE_SIZE+1 linhas e devolve hasMore sem a linha extra', async () => {
    const chamadas: string[] = []
    const vinteESeis = Array.from({ length: 26 }, (_, i) => rawFechado(`c${i}`))
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: vinteESeis, error: null } }, undefined, chamadas),
    })

    const res = await listarHistoricoCaixas(CAIXAS_FILTRO_VAZIO, 2)
    expect(chamadas).toContain('range:25-50')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.linhas).toHaveLength(25)
      expect(res.data.hasMore).toBe(true)
    }
  })

  it('marca turno retomado quando há turno_anterior_id', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({
        caixas: { data: [{ ...rawFechado('c1'), turno_anterior_id: 'c0' }], error: null },
      }),
    })
    const res = await listarHistoricoCaixas()
    expect(res.ok && res.data.linhas[0].retomado).toBe(true)
  })
})

describe('listarCaixasAbertos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk())
  })

  const rawAberto = (id: string) => ({
    id,
    operador_id: 'op1',
    data_abertura: '2026-09-29T08:00:00Z',
    valor_inicial: 200,
    turno_anterior_id: null,
    motivo_retomada: null,
    operador: { nome: 'João' },
  })

  it('agrega sangria/suprimento em UMA consulta em lote (sem N+1) e só conta aprovadas', async () => {
    const chamadas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock(
        {
          caixas: { data: [rawAberto('c1'), rawAberto('c2')], error: null },
          movimentacoes_caixa: {
            data: [
              { caixa_id: 'c1', tipo: 'sangria', valor: 300, status: 'aprovado' },
              { caixa_id: 'c1', tipo: 'sangria', valor: 999, status: 'pendente' },
              { caixa_id: 'c1', tipo: 'suprimento', valor: 100, status: 'aprovado' },
              { caixa_id: 'c2', tipo: 'estorno', valor: 50, status: 'aprovado' },
            ],
            error: null,
          },
        },
        undefined,
        chamadas,
      ),
    })

    const res = await listarCaixasAbertos()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data[0]).toMatchObject({ id: 'c1', operadorNome: 'João', sangrias: 300, suprimentos: 100 })
      expect(res.data[1]).toMatchObject({ id: 'c2', sangrias: 0, suprimentos: 0 })
    }
    expect(chamadas.filter((c) => c === 'from:movimentacoes_caixa')).toHaveLength(1)
    expect(chamadas).toContain('in:caixa_id=c1,c2')
    expect(chamadas).toContain('eq:status=ABERTO')
  })

  it('sem caixas abertos, não consulta movimentações', async () => {
    const chamadas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: [], error: null } }, undefined, chamadas),
    })
    const res = await listarCaixasAbertos()
    expect(res).toEqual({ ok: true, data: [] })
    expect(chamadas).not.toContain('from:movimentacoes_caixa')
  })

  it('GERENTE filtra pela loja da sessão; DONO não filtra', async () => {
    const lojas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: [], error: null } }, (_t, l) => lojas.push(l)),
    })
    assertGerenteSession.mockResolvedValue(sessionOk('GERENTE', 'loja-g'))
    await listarCaixasAbertos()
    assertGerenteSession.mockResolvedValue(sessionOk('DONO', 'loja-d'))
    await listarCaixasAbertos()
    expect(lojas).toEqual(['loja-g'])
  })

  it('sem sessão válida, recusa sem consultar', async () => {
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Não autorizado.' })
    const fromSpy = vi.fn()
    createClient.mockResolvedValue({ from: fromSpy })
    const res = await listarCaixasAbertos()
    expect(res.ok).toBe(false)
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

describe('resumoCaixas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk())
  })

  it('devolve as contagens (head count) de fechados hoje e com diferença', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: null, error: null, count: 4 } }),
    })
    const res = await resumoCaixas(CAIXAS_FILTRO_VAZIO)
    expect(res).toEqual({ ok: true, data: { fechadosHoje: 4, comDiferenca: 4, fechadosIncompletos: 4 } })
  })

  it('conta FECHADO sem dados de fechamento à parte (integridade), com o mesmo escopo de loja', async () => {
    const chamadas: string[] = []
    const lojas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: null, error: null, count: 2 } }, (_t, l) => lojas.push(l), chamadas),
    })
    await resumoCaixas(CAIXAS_FILTRO_VAZIO)
    expect(chamadas).toContain('or:data_fechamento.is.null,valor_fechamento.is.null,fechamento_diferenca.is.null')
    expect(lojas).toHaveLength(3) // hoje + divergentes + incompletos, todos filtrados pela loja do GERENTE
  })

  it('erro em qualquer contagem falha, não zera o KPI', async () => {
    createClient.mockResolvedValue({
      from: buildFromMock({ caixas: { data: null, error: { message: 'x' }, count: null } }),
    })
    const res = await resumoCaixas()
    expect(res.ok).toBe(false)
  })

  it('perfil não autorizado não executa query', async () => {
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Não autorizado.' })
    const fromSpy = vi.fn()
    createClient.mockResolvedValue({ from: fromSpy })
    const res = await resumoCaixas()
    expect(res.ok).toBe(false)
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

describe('listarOperadoresCaixa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue(sessionOk('GERENTE', 'loja-a'))
  })

  it('lista operadores da própria loja', async () => {
    const lojas: string[] = []
    createClient.mockResolvedValue({
      from: buildFromMock(
        { usuarios: { data: [{ id: 'u1', nome: 'Ana' }], error: null } },
        (_t, l) => lojas.push(l),
      ),
    })
    const res = await listarOperadoresCaixa()
    expect(res).toEqual({ ok: true, data: [{ id: 'u1', nome: 'Ana' }] })
    expect(lojas).toEqual(['loja-a'])
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
})
