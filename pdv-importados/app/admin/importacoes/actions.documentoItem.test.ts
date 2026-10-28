import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CALC-001.1 (revisão PR #624) — editar um item não pode apagar o vínculo item↔documento.
 * `import_salvar_item` regrava `documento_id` a partir de p_item: se a action não o enviar, o UPDATE zera o vínculo.
 */

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'item-id', error: null })))
const lerDocumento = vi.hoisted(() => vi.fn())
const actionImportacoes = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/import/hub/gateImportacoes', () => ({ actionImportacoes }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/import/importIntelligence', () => ({ aprovarApuracao: vi.fn(), apurarOperacao: vi.fn() }))

import { salvarItemAction } from './actions'

const OP = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
const DOC = '33333333-3333-4333-8333-333333333333'
const base = {
  descricao: 'Caixa de som BT', moeda: 'USD', valor_mercadoria_moeda: '10', quantidade_comercial: '10',
  unidade_comercial: 'CX', fator_para_estoque: '12', quantidade_estoque: '120',
}

const client = {
  rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lerDocumento }) }) }),
}

describe('salvarItemAction — preserva documento_id na edição', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actionImportacoes.mockResolvedValue({ ok: true, ctx: { client } })
  })

  it('edição de item vinculado a documento reenvia o documento_id atual', async () => {
    lerDocumento.mockResolvedValue({ data: { documento_id: DOC }, error: null })
    const r = await salvarItemAction(OP, { ...base, id: ITEM })
    expect(r.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('import_salvar_item', expect.objectContaining({
      p_item: expect.objectContaining({ id: ITEM, documento_id: DOC }),
    }))
  })

  it('item novo (sem id) envia documento_id nulo sem consultar o banco', async () => {
    const r = await salvarItemAction(OP, base)
    expect(r.ok).toBe(true)
    expect(lerDocumento).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('import_salvar_item', expect.objectContaining({
      p_item: expect.objectContaining({ documento_id: null }),
    }))
  })

  it('falha ao ler o vínculo bloqueia a gravação (nunca zera o vínculo em silêncio)', async () => {
    lerDocumento.mockResolvedValue({ data: null, error: { message: 'RLS' } })
    const r = await salvarItemAction(OP, { ...base, id: ITEM })
    expect(r).toMatchObject({ ok: false, erro: 'erro_generico' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
