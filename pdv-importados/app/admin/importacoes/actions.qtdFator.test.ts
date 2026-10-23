import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CALC-001.1 / P5 — quantidade em estoque ≠ comercial × fator é barrada no SAVE (antes ia ao banco e
 * só a simulação acusava, com o UUID do item). E o erro da simulação mostra o nome do item.
 */

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'novo-id', error: null })))
const eq = vi.hoisted(() => vi.fn(async () => ({ data: [{ id: '33333333-3333-4333-8333-333333333333', descricao: 'Caixa de som BT' }] })))
const actionImportacoes = vi.hoisted(() => vi.fn())
const apurarOperacao = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/import/hub/gateImportacoes', () => ({ actionImportacoes }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/import/importIntelligence', () => ({ aprovarApuracao: vi.fn(), apurarOperacao }))

import { apurarAction, salvarItemAction } from './actions'

const OP = '11111111-1111-4111-8111-111111111111'
const base = {
  descricao: 'Caixa de som BT', moeda: 'USD', valor_mercadoria_moeda: '10', quantidade_comercial: '10',
  unidade_comercial: 'CX', fator_para_estoque: '12', quantidade_estoque: '120',
}

describe('P5 — qtd comercial × fator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client: { rpc, from: () => ({ select: () => ({ eq }) }) } } })
  })

  it('consistente (10 CX × 12 = 120) → grava', async () => {
    expect(await salvarItemAction(OP, base)).toEqual({ ok: true, data: { id: 'novo-id' } })
    expect(rpc).toHaveBeenCalledWith('import_salvar_item', expect.anything())
  })

  it('inconsistente (estoque 12) → erro_qtd_fator com o nome do produto e nenhuma RPC', async () => {
    const r = await salvarItemAction(OP, { ...base, quantidade_estoque: '12' })
    expect(r).toEqual({ ok: false, erro: 'erro_qtd_fator', detalhe: '"Caixa de som BT": 10 × 12 ≠ 12' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fator 1 concatenado em 11 (P4) é pego no save', async () => {
    const r = await salvarItemAction(OP, { ...base, quantidade_comercial: '120', fator_para_estoque: '11' })
    expect(r).toMatchObject({ ok: false, erro: 'erro_qtd_fator' })
  })

  it('simulação com item legado inconsistente → nome do item, não UUID', async () => {
    apurarOperacao.mockResolvedValue({
      ok: false, motivo: 'ENTRADA_INVALIDA', detalhe: 'LANDED_QTD_FATOR_INCONSISTENTE: 33333333-3333-4333-8333-333333333333',
    })
    expect(await apurarAction(OP, 'SIMULACAO')).toEqual({ ok: false, erro: 'erro_qtd_fator', detalhe: '"Caixa de som BT"' })
    expect(eq).toHaveBeenCalledWith('operacao_id', OP)
  })
})
