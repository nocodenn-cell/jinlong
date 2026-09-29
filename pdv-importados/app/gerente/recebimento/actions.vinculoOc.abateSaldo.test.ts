import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-04 — substitui o teste de CARACTERIZAÇÃO do BP-F1 ("o vínculo não baixa a OC"), que previa
 * exatamente esta mudança: agora o id da OC vai para `criar_confirmar_remessa_entrada`, que abate o
 * saldo POR ITEM na mesma transação. A regra em si (saldo, excesso, lock, idempotência) é do banco
 * e é provada em `backend/scripts/ux04-oc-recebimento-parcial.test.sql`; aqui se prova que a action
 * (a) envia o vínculo só quando há pedido, (b) nunca escreve em `ordens_compra` por conta própria,
 * (c) traduz os erros do banco e (d) devolve o estado real do pedido depois da entrada.
 */

const assertGerenteSessionMock = vi.fn()
const getGerenteLojaIdMock = vi.fn()
const rpcMock = vi.fn()
const ocLeituraMock = vi.fn()
const escritaMock = vi.fn()

let estoqueFalha = false
const SALDO_ESTOQUE = { produto_id: 'p1', loja_id: 'loja-1', quantidade_atual: 75, estoque_minimo: 0 }

function buildSupabaseMock() {
  return {
    rpc: rpcMock,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // `estoque` é lido só para o feedback do saldo novo; o resto é a leitura do pedido.
            maybeSingle: async () =>
              table === 'estoque'
                ? estoqueFalha
                  ? { data: null, error: { message: 'falha' } }
                  : { data: SALDO_ESTOQUE, error: null }
                : ocLeituraMock(table),
          }),
        }),
      }),
      insert: (...a: unknown[]) => escritaMock(table, 'insert', a),
      update: (...a: unknown[]) => escritaMock(table, 'update', a),
      upsert: (...a: unknown[]) => escritaMock(table, 'upsert', a),
      delete: (...a: unknown[]) => escritaMock(table, 'delete', a),
    }),
  }
}

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession: assertGerenteSessionMock }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: getGerenteLojaIdMock }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => buildSupabaseMock()) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const item60 = { produto_id: 'p1', quantidade_esperada: 60, quantidade_conferida: 60 }

describe('recebimento manual com pedido — o vínculo abate o saldo (UX-04)', () => {
  beforeAll(async () => {
    await import('./actions')
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { userId: 'mgr-1', lojaId: 'loja-1' } })
    getGerenteLojaIdMock.mockResolvedValue('loja-1')
    rpcMock.mockResolvedValue({ data: 'remessa-1', error: null })
  })

  it('com pedido: envia p_ordem_compra_id à RPC e devolve o saldo real (100 pedidas, 60 recebidas, faltam 40)', async () => {
    ocLeituraMock.mockResolvedValue({
      data: {
        id: 'oc-43',
        status: 'EM_TRANSITO',
        encerrada_com_falta_em: null,
        itens: [{ quantidade: 100, quantidade_recebida: 60 }],
      },
      error: null,
    })
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Entrega do pedido 43',
      idempotency_key: 'k-1',
      itens: [item60],
      ordemCompraId: 'oc-43',
    })

    expect(res.success).toBe(true)
    const [nome, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(nome).toBe('criar_confirmar_remessa_entrada')
    expect(params.p_ordem_compra_id).toBe('oc-43')
    if (res.success) {
      expect(res.data.remessaId).toBe('remessa-1')
      expect(res.data.oc).toMatchObject({ pedido_total: 100, recebido_total: 60, pendente_total: 40, encerrada: false })
      expect(res.data.saldoAtual).toBe(75)
    }
    // a action nunca altera o pedido por conta própria: quem abate é o banco, dentro da RPC
    expect(escritaMock).not.toHaveBeenCalled()
  })

  it('pedido que fechou: informa que o pedido foi totalmente recebido', async () => {
    ocLeituraMock.mockResolvedValue({
      data: { id: 'oc-44', status: 'RECEBIDA', encerrada_com_falta_em: null, itens: [{ quantidade: 100, quantidade_recebida: 100 }] },
      error: null,
    })
    // a checagem amigável lê o status antes da RPC; aqui simulamos a OC ainda aberta nessa leitura
    ocLeituraMock.mockResolvedValueOnce({ data: { status: 'EM_TRANSITO' }, error: null })
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Última entrega',
      idempotency_key: 'k-2',
      itens: [{ produto_id: 'p1', quantidade_esperada: 40, quantidade_conferida: 40 }],
      ordemCompraId: 'oc-44',
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.oc?.encerrada).toBe(true)
      expect(res.data.oc).toMatchObject({ pedido_total: 100, recebido_total: 100, pendente_total: 0 })
    }
  })

  it('sem pedido: exatamente os 4 argumentos de sempre, sem consulta de OC e sem resumo de pedido', async () => {
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Container 01',
      idempotency_key: 'k-3',
      itens: [item60],
    })

    expect(res.success).toBe(true)
    const [, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(params).sort()).toEqual(['p_idempotency_key', 'p_itens', 'p_observacao', 'p_origem'])
    expect(ocLeituraMock).not.toHaveBeenCalled()
    if (res.success) {
      expect(res.data.oc).toBeNull()
      expect(res.data.saldoAtual).toBe(75)
    }
  })

  it('sem documento: esperada ausente vira a própria conferida na RPC (a RPC continua exigindo os dois)', async () => {
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Container 02',
      idempotency_key: 'k-4',
      itens: [{ produto_id: 'p1', quantidade_conferida: 7.5 }],
    })

    expect(res.success).toBe(true)
    const [, params] = rpcMock.mock.calls[0] as [string, { p_itens: unknown }]
    expect(params.p_itens).toEqual([{ produto_id: 'p1', quantidade_esperada: 7.5, quantidade_conferida: 7.5 }])
  })

  it('saldo novo indisponível: a entrada continua confirmada, com saldoAtual nulo', async () => {
    estoqueFalha = true
    try {
      const { criarRemessaConferencia } = await import('./actions')
      const res = await criarRemessaConferencia({ origem: 'Container 03', idempotency_key: 'k-5', itens: [item60] })
      expect(res.success).toBe(true)
      if (res.success) expect(res.data.saldoAtual).toBeNull()
    } finally {
      estoqueFalha = false
    }
  })

  it('acima do saldo (P0): a RPC recusa e a action explica quanto falta, sem sucesso', async () => {
    ocLeituraMock.mockResolvedValue({ data: { status: 'EM_TRANSITO' }, error: null })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'OC_QTD_ACIMA_SALDO:11111111-1111-1111-1111-111111111111:40.000' } })
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Duplicidade',
      idempotency_key: 'k-4',
      itens: [{ produto_id: 'p1', quantidade_esperada: 100, quantidade_conferida: 100 }],
      ordemCompraId: 'oc-45',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('maior do que ainda falta receber')
      expect(res.error).toContain('Faltam 40 unidades.')
      expect(res.error).toContain('Nada foi lançado no estoque')
    }
  })

  it('produto que não faz parte do pedido: mensagem própria (não é erro genérico)', async () => {
    ocLeituraMock.mockResolvedValue({ data: { status: 'EM_TRANSITO' }, error: null })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'OC_PRODUTO_FORA_DO_PEDIDO:p9' } })
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Outro produto',
      idempotency_key: 'k-5',
      itens: [item60],
      ordemCompraId: 'oc-46',
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('não faz parte do pedido')
  })
})
