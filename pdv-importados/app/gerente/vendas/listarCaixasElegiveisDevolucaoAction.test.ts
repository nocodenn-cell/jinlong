/**
 * PR-2D — `listarCaixasElegiveisDevolucaoAction` lê a lista pela RPC `listar_caixas_elegiveis_desembolso`
 * (identidade e loja no banco). A action não envia loja, não toca `caixas` e mantém o contrato que o modal usa.
 * A regra de elegibilidade em si é provada no SQL (backend/scripts/listar-caixas-elegiveis-desembolso.test.sql).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()
const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock, from: fromMock })),
}))
vi.mock('@/app/caixa/actions', () => ({ cancelarVenda: vi.fn() }))
vi.mock('@/app/gerente/vendas/devolverOuTrocarVenda.impl', () => ({ devolverOuTrocarVendaImpl: vi.fn() }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: vi.fn() }))

describe('listarCaixasElegiveisDevolucaoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { idioma: 'pt' } })
  })

  it('chama a RPC sem argumentos (nenhuma loja do cliente) e não lê `caixas` direto', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    await listarCaixasElegiveisDevolucaoAction()

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('listar_caixas_elegiveis_desembolso')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('mapeia operador_nome → operador preservando id e a ordem devolvida pelo banco', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: 'c-1', operador_nome: 'Ana' },
        { id: 'c-2', operador_nome: 'Bruno' },
      ],
      error: null,
    })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    expect(await listarCaixasElegiveisDevolucaoAction()).toEqual({
      ok: true,
      caixas: [
        { id: 'c-1', operador: 'Ana' },
        { id: 'c-2', operador: 'Bruno' },
      ],
    })
  })

  it('conjunto vazio (0 elegíveis) vira lista vazia, não erro', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    expect(await listarCaixasElegiveisDevolucaoAction()).toEqual({ ok: true, caixas: [] })
  })

  it('data nula é tratada como lista vazia', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    expect(await listarCaixasElegiveisDevolucaoAction()).toEqual({ ok: true, caixas: [] })
  })

  it('erro da RPC devolve mensagem genérica (sem vazar detalhe do banco)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom: detalhe interno' } })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    expect(await listarCaixasElegiveisDevolucaoAction()).toEqual({
      ok: false,
      error: 'Não foi possível listar os caixas abertos.',
    })
  })

  it('sem sessão gerencial não chama a RPC', async () => {
    assertGerenteSessionMock.mockResolvedValue({ ok: false, error: 'Acesso negado.' })
    const { listarCaixasElegiveisDevolucaoAction } = await import('./actions')

    expect(await listarCaixasElegiveisDevolucaoAction()).toEqual({ ok: false, error: 'Acesso negado.' })
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
