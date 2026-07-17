import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

/** Linha mínima aceita por `mapRow` em actions.ts. */
function row(id: string) {
  return {
    id,
    fornecedor_id: 'f1',
    descricao: 'x',
    valor_total: 10,
    valor_pago: 0,
    vencimento: null,
    status: 'PENDENTE',
    nfe_numero: null,
    nfe_importacao_id: null,
    criado_em: null,
  }
}

/** Builder encadeável (from/select/order/range/eq/...) que resolve como thenable. */
function chainable(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  for (const m of ['from', 'select', 'order', 'range', 'eq', 'gte', 'lt', 'or']) {
    obj[m] = vi.fn(() => obj)
  }
  return obj
}

describe('gerente/financeiro/contas-pagar exportarContasPagarParaCSVAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { userId: 'u1', lojaId: 'l1' } })
  })

  it('pagina até esgotar hasMore, não trunca na primeira página (regressão: CHUNK != PAGE_SIZE)', async () => {
    // PAGE_SIZE interno de buscarContasPagarAction é 20; range busca PAGE_SIZE+1
    // para detectar hasMore. Página 1: 21 linhas → hasMore=true, retorna 20.
    // Página 2: 5 linhas → hasMore=false, retorna 5. Total esperado: 25.
    const pagina1 = Array.from({ length: 21 }, (_, i) => row(`p1-${i}`))
    const pagina2 = Array.from({ length: 5 }, (_, i) => row(`p2-${i}`))

    let chamada = 0
    const createClientMock = vi.fn(async () => ({
      from: vi.fn(() => {
        chamada += 1
        const data = chamada === 1 ? pagina1 : pagina2
        return chainable({ data, error: null })
      }),
    }))
    vi.doMock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

    const { exportarContasPagarParaCSVAction } = await import('./actions')
    const r = await exportarContasPagarParaCSVAction({})

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.rows).toHaveLength(25)
      expect(chamada).toBe(2)
    }
  })
})
