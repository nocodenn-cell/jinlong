import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinalizarVendaInput } from './finalizarVendaValidation'

const createClientMock = vi.fn()
const getLojaIdUsuarioMock = vi.fn()
const resolveVendaIdForFinalizeMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/lojaUsuario', () => ({
  LOJA_MATRIZ_ID: '00000000-0000-0000-0000-000000000001',
  getLojaIdUsuario: getLojaIdUsuarioMock,
}))

vi.mock('@/lib/caixa/resolveVendaIdForFinalize', () => ({
  resolveVendaIdForFinalize: resolveVendaIdForFinalizeMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

type RpcCall = { name: string; params: Record<string, unknown> }

type MockQueryResult = { data: unknown; error: null }

class QueryBuilder {
  private filters: Record<string, unknown> = {}

  constructor(
    private readonly table: string,
    private readonly state: {
      estoquePorProduto: Record<string, { quantidadeAtual: number; nome: string }>
      caixaAberto: boolean
    },
  ) {}

  select(): this {
    return this
  }

  eq(field: string, value: unknown): this {
    this.filters[field] = value
    return this
  }

  in(field: string, values: unknown[]): this {
    this.filters[field] = values
    return this
  }

  order(): this {
    return this
  }

  limit(): this {
    return this
  }

  maybeSingle(): Promise<MockQueryResult> {
    if (this.table === 'caixas') {
      if (!this.state.caixaAberto) return Promise.resolve({ data: null, error: null })
      return Promise.resolve({
        data: { id: '22222222-2222-2222-2222-222222222222' },
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  }

  /** Usado por `getUsuarioIdioma` quando `safeParse` falha (ex.: soma de parcelas ≠ total líquido). */
  single(): Promise<MockQueryResult> {
    if (this.table === 'usuarios') {
      return Promise.resolve({
        data: { perfil: 'OPERADOR', idioma_preferido: 'pt' },
        error: null,
      })
    }
    return this.execute().then((res) => ({
      data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data,
      error: null,
    }))
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: MockQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private execute(): Promise<MockQueryResult> {
    if (this.table === 'produtos') {
      const ids = (this.filters.id as string[]) ?? []
      const data = ids.map((id) => ({
        id,
        nome: `Produto ${id.slice(0, 4)}`,
        preco_varejo: 10,
        preco_atacado: null,
        categoria_id: null,
        ativo: true,
        status_publicacao: 'PUBLICADO',
      }))
      return Promise.resolve({ data, error: null })
    }

    if (this.table === 'regras_preco') {
      return Promise.resolve({ data: [], error: null })
    }

    if (this.table === 'estoque') {
      const ids = (this.filters.produto_id as string[]) ?? []
      const data = ids.map((id) => ({
        produto_id: id,
        quantidade_atual: this.state.estoquePorProduto[id]?.quantidadeAtual ?? 999,
        produtos: { nome: this.state.estoquePorProduto[id]?.nome ?? 'Produto mock' },
      }))
      return Promise.resolve({ data, error: null })
    }

    return Promise.resolve({ data: [], error: null })
  }
}

function makeSupabase(opts?: { caixaAberto?: boolean }) {
  const rpcCalls: RpcCall[] = []
  const state = {
    caixaAberto: opts?.caixaAberto ?? true,
    estoquePorProduto: {
      '11111111-1111-1111-1111-111111111111': { quantidadeAtual: 999, nome: 'Produto Teste' },
    },
  }

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: '33333333-3333-3333-3333-333333333333' } },
      }),
    },
    from: vi.fn((table: string) => new QueryBuilder(table, state)),
    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params })
      if (name === 'calcular_preco_produto') {
        return Promise.resolve({
          data: { preco: 10, tipo: 'VAREJO' },
          error: null,
        })
      }
      if (name === 'finalizar_venda_transacional_canonica_v3') {
        return Promise.resolve({
          data: [
            {
              venda_id: '66666666-6666-6666-8666-666666666666',
              status: 'CONCLUIDA',
              event_id: '77777777-7777-8777-8777-777777777777',
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: {}, error: null })
    }),
  }
  return { supabase, rpcCalls }
}

function payloadBase(): FinalizarVendaInput {
  return {
    idempotencyKey: '44444444-4444-4444-8444-444444444444',
    formaPagamento: 'DINHEIRO',
    pagamentos: [
      { formaPagamento: 'DINHEIRO', valor: 20 },
      { formaPagamento: 'PIX', valor: 10 },
    ],
    itens: [
      {
        produtoId: '11111111-1111-1111-1111-111111111111',
        quantidade: 3,
        precoOriginal: 10,
        precoUnitario: 10,
        tipoPreco: 'VAREJO',
      },
    ],
    totalBruto: 30,
    totalDesconto: 0,
    totalLiquido: 30,
  }
}

describe('finalizarVendaCaixa — auditoria legado/unificado', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.USE_UNIFIED_SALES_FLOW = 'false'
    getLojaIdUsuarioMock.mockResolvedValue('55555555-5555-5555-8555-555555555555')
    resolveVendaIdForFinalizeMock.mockReturnValue('66666666-6666-6666-8666-666666666666')
  })

  it(
    'legado bloqueia split >1 com mensagem esperada',
    async () => {
    const { supabase } = makeSupabase()
    createClientMock.mockResolvedValue(supabase)
    const { finalizarVendaCaixa } = await import('./actions')

    const result = await finalizarVendaCaixa(payloadBase())
    expect(result).toEqual({
      ok: false,
      error:
        'Split de pagamento requer fluxo unificado habilitado no servidor. Ajuste para 1 forma de pagamento.',
    })
    },
    15000,
  )

  it('unificado aceita split e envia p_pagamentos para RPC canônica', async () => {
    process.env.USE_UNIFIED_SALES_FLOW = 'true'
    const { supabase, rpcCalls } = makeSupabase()
    createClientMock.mockResolvedValue(supabase)
    const { finalizarVendaCaixa } = await import('./actions')

    const result = await finalizarVendaCaixa(payloadBase())
    expect(result).toEqual({
      ok: true,
      vendaId: '66666666-6666-6666-8666-666666666666',
      eventId: '77777777-7777-8777-8777-777777777777',
    })

    const txCall = rpcCalls.find((c) => c.name === 'finalizar_venda_transacional_canonica_v3')
    expect(txCall).toBeTruthy()
    expect(txCall?.params.p_pagamentos).toEqual([
      { forma_pagamento: 'DINHEIRO', valor: 20 },
      { forma_pagamento: 'PIX', valor: 10 },
    ])
  })

  it('retorna mensagem de erro esperada para payload inválido (pagamentos != total)', async () => {
    process.env.USE_UNIFIED_SALES_FLOW = 'true'
    const { supabase } = makeSupabase()
    createClientMock.mockResolvedValue(supabase)
    const { finalizarVendaCaixa } = await import('./actions')
    const payloadInvalido = payloadBase()
    payloadInvalido.pagamentos = [{ formaPagamento: 'DINHEIRO', valor: 1 }]

    const result = await finalizarVendaCaixa(payloadInvalido)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Dados inválidos:')
    expect(result.error).toContain('A soma das parcelas deve ser igual ao total líquido')
  })
})

