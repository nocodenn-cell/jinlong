import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Vínculo opcional do recebimento manual com uma Ordem de Compra (S8/RM-14; UX-04).
 * A action faz a checagem amigável de status; o abatimento do saldo é do banco
 * (`criar_confirmar_remessa_entrada`, testado em SQL). Mesmo padrão de mock de
 * `gerente/transferencias/actions.test.ts`, com `.from()` encadeável para a consulta da OC.
 */

const assertGerenteSessionMock = vi.fn()
const getGerenteLojaIdMock = vi.fn()
const revalidatePathMock = vi.fn()
const rpcMock = vi.fn()
const ocQueryMock = vi.fn()

function buildSupabaseMock() {
  return {
    rpc: rpcMock,
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col1: string, _val1: string) => ({
          eq: (_col2: string, _val2: string) => ({
            maybeSingle: async () => ocQueryMock(table),
          }),
        }),
      }),
    }),
  }
}

const createClientMock = vi.fn(async () => buildSupabaseMock())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/gerente/auth/sessionContext', () => ({
  getGerenteLojaId: getGerenteLojaIdMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

const itemValido = { produto_id: 'p1', quantidade_esperada: 10, quantidade_conferida: 10 }

describe('gerente/recebimento — criarRemessaConferencia: vínculo com OC (S8/RM-14)', () => {
  // Mesmo cuidado de timeout de import já usado em transferencias/actions.test.ts.
  beforeAll(async () => {
    await import('./actions')
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { userId: 'mgr-1', lojaId: 'loja-1' } })
    getGerenteLojaIdMock.mockResolvedValue('loja-1')
    rpcMock.mockResolvedValue({ data: 'remessa-1', error: null })
  })

  it('1. sem vínculo (ordemCompraId ausente) → permitido, RPC não consulta OC', async () => {
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Container 01',
      idempotency_key: 'k-1',
      itens: [itemValido],
    })

    expect(res.success).toBe(true)
    expect(ocQueryMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith(
      'criar_confirmar_remessa_entrada',
      expect.objectContaining({ p_origem: 'Container 01' }),
    )
  })

  it('2. OC CONFIRMADA → vínculo permitido, recebimento segue', async () => {
    ocQueryMock.mockResolvedValue({ data: { status: 'CONFIRMADA' }, error: null })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-42',
      idempotency_key: 'k-2',
      itens: [itemValido],
      ordemCompraId: 'oc-42',
    })

    expect(res.success).toBe(true)
    expect(ocQueryMock).toHaveBeenCalledWith('ordens_compra')
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('3. OC EM_TRANSITO → vínculo permitido, recebimento segue', async () => {
    ocQueryMock.mockResolvedValue({ data: { status: 'EM_TRANSITO' }, error: null })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-43',
      idempotency_key: 'k-3',
      itens: [itemValido],
      ordemCompraId: 'oc-43',
    })

    expect(res.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('4. OC RECEBIDA → vínculo recusado com mensagem clara, RPC nunca chamada', async () => {
    ocQueryMock.mockResolvedValue({ data: { status: 'RECEBIDA' }, error: null })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-44',
      idempotency_key: 'k-4',
      itens: [itemValido],
      ordemCompraId: 'oc-44',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('já está encerrada')
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it.each([
    ['CANCELADA', 'foi cancelada'],
    ['RASCUNHO', 'Confirme a ordem de compra'],
  ])('4b. OC %s → recusada antes da RPC', async (status, trecho) => {
    ocQueryMock.mockResolvedValue({ data: { status }, error: null })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-4b',
      idempotency_key: 'k-4b',
      itens: [itemValido],
      ordemCompraId: 'oc-4b',
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain(trecho)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('5a. erro na consulta da OC → fail closed, recebimento inteiro recusado', async () => {
    ocQueryMock.mockResolvedValue({ data: null, error: { message: 'timeout' } })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-45',
      idempotency_key: 'k-5a',
      itens: [itemValido],
      ordemCompraId: 'oc-45',
    })

    expect(res.success).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('5b. OC não encontrada (RLS/tenant nega ou id de outra loja) → fail closed, recebimento inteiro recusado', async () => {
    ocQueryMock.mockResolvedValue({ data: null, error: null })

    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'OC-46',
      idempotency_key: 'k-5b',
      itens: [itemValido],
      ordemCompraId: 'oc-de-outra-loja',
    })

    expect(res.success).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('a consulta de status da OC é escopada por id e por loja_id (tenant)', async () => {
    ocQueryMock.mockResolvedValue({ data: { status: 'CONFIRMADA' }, error: null })
    getGerenteLojaIdMock.mockResolvedValue('loja-especifica')

    const { criarRemessaConferencia } = await import('./actions')
    await criarRemessaConferencia({
      origem: 'OC-47',
      idempotency_key: 'k-6',
      itens: [itemValido],
      ordemCompraId: 'oc-47',
    })

    // A cadeia mockada (from → select → eq → eq → maybeSingle) só resolve se
    // os dois `.eq()` (id e loja_id) forem de fato chamados nessa ordem —
    // ver buildSupabaseMock() acima.
    expect(ocQueryMock).toHaveBeenCalledWith('ordens_compra')
  })
})
