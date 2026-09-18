import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BP-F1 — TESTE DE CARACTERIZAÇÃO (documenta o comportamento ATUAL, não o
 * desejado).
 *
 * Achado: no recebimento manual com vínculo de Ordem de Compra (S8/RM-14,
 * "Opção 1"), o vínculo só VALIDA o status da OC. Depois de validar, a action
 * chama `criar_confirmar_remessa_entrada` SEM o id da OC e não escreve nada em
 * `ordens_compra`. Consequência: a OC segue "Em trânsito" e o botão "Registrar
 * recebimento" do próprio pedido continua disponível — receber a mesma
 * mercadoria pelos dois caminhos credita o estoque duas vezes (o estoque é
 * creditado por `criar_confirmar_remessa_entrada` e por `receber_ordem_compra`,
 * que não se conhecem).
 *
 * Corrigir isso exige decidir como a OC muda de estado (decisão de produto
 * BP-E1 / mudança de RPC BP-F1). Quando essa decisão sair, ESTE teste deve ser
 * substituído — falhar aqui significa que o comportamento mudou de propósito.
 */

const assertGerenteSessionMock = vi.fn()
const getGerenteLojaIdMock = vi.fn()
const rpcMock = vi.fn()
const ocStatusMock = vi.fn()
const escritaMock = vi.fn()

function buildSupabaseMock() {
  return {
    rpc: rpcMock,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ocStatusMock(table) }),
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

describe('recebimento manual com vínculo de OC — o vínculo não baixa a OC (caracterização, BP-F1)', () => {
  beforeAll(async () => {
    await import('./actions')
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { userId: 'mgr-1', lojaId: 'loja-1' } })
    getGerenteLojaIdMock.mockResolvedValue('loja-1')
    rpcMock.mockResolvedValue({ data: 'remessa-1', error: null })
    ocStatusMock.mockResolvedValue({ data: { status: 'EM_TRANSITO' }, error: null })
  })

  it('OC em trânsito vinculada: estoque é creditado pela RPC de remessa, sem o id da OC e sem tocar em ordens_compra', async () => {
    const { criarRemessaConferencia } = await import('./actions')
    const res = await criarRemessaConferencia({
      origem: 'Entrega do pedido 43',
      idempotency_key: 'k-carac-1',
      itens: [{ produto_id: 'p1', quantidade_esperada: 10, quantidade_conferida: 10 }],
      ordemCompraId: 'oc-43',
    })

    expect(res.success).toBe(true)

    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [nomeRpc, params] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(nomeRpc).toBe('criar_confirmar_remessa_entrada')
    expect(Object.keys(params).sort()).toEqual(['p_idempotency_key', 'p_itens', 'p_observacao', 'p_origem'])
    expect(JSON.stringify(params)).not.toContain('oc-43')

    expect(escritaMock).not.toHaveBeenCalled()
  })
})
