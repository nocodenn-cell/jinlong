import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()
const getGerenteLojaIdMock = vi.fn()
const getGerenteUserIdMock = vi.fn()
const revalidatePathMock = vi.fn()
const rpcMock = vi.fn()
const updateMock = vi.fn()
const singleMock = vi.fn()

function makeEqChain(result: unknown) {
  return { eq: vi.fn(() => result) }
}

function makeSelectChain(result: unknown) {
  return { select: vi.fn(() => result) }
}

const fromMock = vi.fn(() => ({
  ...makeSelectChain(makeEqChain(makeEqChain({ single: singleMock }))),
  update: updateMock,
}))

const createClientMock = vi.fn(async () => ({
  from: fromMock,
  rpc: rpcMock,
}))

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/gerente/auth/sessionContext', () => ({
  getGerenteLojaId: getGerenteLojaIdMock,
  getGerenteUserId: getGerenteUserIdMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

describe('gerente/compras actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1' },
    })
    getGerenteLojaIdMock.mockResolvedValue('loja-1')
    getGerenteUserIdMock.mockResolvedValue('mgr-1')
    singleMock.mockResolvedValue({ data: { status: 'EM_TRANSITO' }, error: null })
    rpcMock.mockResolvedValue({ data: null, error: null })
    updateMock.mockReturnValue(makeEqChain(makeEqChain({ error: null })))
  })

  it('bloqueia RECEBIDA via atualização direta de status', async () => {
    const { atualizarStatusOC } = await import('./actions')
    const res = await atualizarStatusOC('oc-1', 'RECEBIDA')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('Transição')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('não chama RPC de recebimento com lista vazia', async () => {
    const { registrarRecebimentoOC } = await import('./actions')
    const res = await registrarRecebimentoOC('oc-1', [])

    expect(res.success).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('cria OC pelo RPC transacional', async () => {
    rpcMock.mockResolvedValue({ data: 'oc-1', error: null })

    const { criarOrdemCompra } = await import('./actions')
    const res = await criarOrdemCompra({
      data_emissao: '2026-05-25',
      itens: [{ descricao: 'Item livre', quantidade: 2, preco_unitario: 3, unidade_medida: 'UN' }],
    })

    expect(res).toEqual({ success: true, data: 'oc-1' })
    expect(rpcMock).toHaveBeenCalledWith('criar_ordem_compra_segura', expect.objectContaining({
      p_loja_id: 'loja-1',
      p_itens: expect.arrayContaining([expect.objectContaining({ quantidade: 2 })]),
    }))
  })

  it('atualiza OC pelo RPC transacional', async () => {
    singleMock.mockResolvedValue({ data: { status: 'RASCUNHO' }, error: null })

    const { atualizarOrdemCompra } = await import('./actions')
    const res = await atualizarOrdemCompra({
      id: 'oc-1',
      data_emissao: '2026-05-25',
      itens: [{ descricao: 'Item livre', quantidade: 2, preco_unitario: 3, unidade_medida: 'UN' }],
    })

    expect(res).toEqual({ success: true, data: null })
    expect(rpcMock).toHaveBeenCalledWith('atualizar_ordem_compra_segura', expect.objectContaining({
      p_oc_id: 'oc-1',
      p_loja_id: 'loja-1',
    }))
  })
})
