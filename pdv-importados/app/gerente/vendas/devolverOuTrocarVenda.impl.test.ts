import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const maybeSingle = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import { devolverOuTrocarVendaImpl } from './devolverOuTrocarVenda.impl'

const BASE = {
  vendaId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  motivo: 'Defeito',
  tipo: 'DEVOLUCAO' as const,
  itens: [{ itemVendaId: '22222222-2222-4222-8222-222222222222', quantidade: 2 }],
  valorEstorno: 50,
  formaEstorno: 'DINHEIRO' as const,
}

const LINHA_OK = {
  operacao_id: 'op-1',
  venda_id: BASE.vendaId,
  tipo: 'DEVOLUCAO',
  valor_estornado: 50,
  valor_caixa_estornado: 50,
  itens: [],
}

describe('devolverOuTrocarVendaImpl — p_caixa_id (PR-2D)', () => {
  beforeEach(() => {
    rpc.mockReset()
    maybeSingle.mockReset()
    maybeSingle.mockResolvedValue({ data: { nome: 'Gerente' } })
  })

  it('envia p_caixa_id nulo quando o operador não escolheu (o servidor decide 0/1/N)', async () => {
    rpc.mockResolvedValue({ data: [LINHA_OK], error: null })
    const r = await devolverOuTrocarVendaImpl(BASE)
    expect(r.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'devolver_ou_trocar_venda',
      expect.objectContaining({ p_caixa_id: null, p_forma_estorno: 'DINHEIRO' }),
    )
  })

  it('envia o caixa escolhido como p_caixa_id', async () => {
    rpc.mockResolvedValue({ data: [LINHA_OK], error: null })
    const caixaId = '44444444-4444-4444-8444-444444444444'
    await devolverOuTrocarVendaImpl({ ...BASE, caixaId })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_caixa_id: caixaId })
  })

  it.each([
    ['DEVOLVER_VENDA_CAIXA_OBRIGATORIO', 'mais de um caixa aberto'],
    ['DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO', 'Estorne as liquidações'],
  ])('traduz %s para o operador', async (codigo, trecho) => {
    rpc.mockResolvedValue({ data: null, error: { message: codigo } })
    const r = await devolverOuTrocarVendaImpl(BASE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(trecho)
  })
})
