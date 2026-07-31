import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gate de publicação em lote.
 *
 * Existe porque a via unitária (`publicarProduto`) impõe `podePublicarProduto`
 * no servidor e a via em lote não impunha — bastava selecionar um INATIVO na
 * lista do catálogo para republicá-lo sem passar por `reativarProduto`. Server
 * Action é endpoint público: regra que só a tela respeita não é regra, e uma
 * regra imposta em apenas um dos dois caminhos não é regra em nenhum.
 */

const assertGerenteSessionMock = vi.fn()
const setProductStatusLoteActionMock = vi.fn()
const inMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ in: inMock }) }),
    // O caminho de erro resolve o idioma da mensagem, que passa por auth.getUser().
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

vi.mock('@/app/admin/produtos/actions', () => ({
  setProductStatusLoteAction: setProductStatusLoteActionMock,
  setProductStatusAction: vi.fn(),
  atualizarProdutoAction: vi.fn(),
  buscarProdutosComFiltrosAction: vi.fn(),
  buscarProdutoPorIdAction: vi.fn(),
  criarProdutoAction: vi.fn(),
  excluirProdutoAction: vi.fn(),
  updateCategoriaLoteAction: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const RASCUNHO = '11111111-1111-4111-8111-111111111111'
const PUBLICADO = '22222222-2222-4222-8222-222222222222'
const INATIVO = '33333333-3333-4333-8333-333333333333'

describe('publicarProdutosLote — gate de rascunho no servidor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
    setProductStatusLoteActionMock.mockResolvedValue({ ok: true, atualizados: 1 })
    inMock.mockResolvedValue({
      data: [
        { id: RASCUNHO, status_publicacao: 'DRAFT' },
        { id: PUBLICADO, status_publicacao: 'PUBLICADO' },
        { id: INATIVO, status_publicacao: 'INATIVO' },
      ],
    })
  })

  it('publica só o rascunho e descarta PUBLICADO e INATIVO do lote', async () => {
    const { publicarProdutosLote } = await import('./actions')
    const res = await publicarProdutosLote([RASCUNHO, PUBLICADO, INATIVO])

    expect(res.success).toBe(true)
    expect(setProductStatusLoteActionMock).toHaveBeenCalledTimes(1)
    expect(setProductStatusLoteActionMock).toHaveBeenCalledWith([RASCUNHO], 'PUBLICADO')
  })

  it('não chama o lifecycle quando nada no lote é publicável', async () => {
    inMock.mockResolvedValue({
      data: [
        { id: PUBLICADO, status_publicacao: 'PUBLICADO' },
        { id: INATIVO, status_publicacao: 'INATIVO' },
      ],
    })

    const { publicarProdutosLote } = await import('./actions')
    const res = await publicarProdutosLote([PUBLICADO, INATIVO])

    expect(res.success).toBe(false)
    expect(setProductStatusLoteActionMock).not.toHaveBeenCalled()
  })

  it('id ausente na leitura é tratado como não publicável (leitura pessimista)', async () => {
    inMock.mockResolvedValue({ data: [] })

    const { publicarProdutosLote } = await import('./actions')
    const res = await publicarProdutosLote([RASCUNHO])

    expect(res.success).toBe(false)
    expect(setProductStatusLoteActionMock).not.toHaveBeenCalled()
  })
})

/**
 * "Ativar" em lote é a outra porta para PUBLICADO (`statusFromAtivoLegacy(true)`).
 * Sem o mesmo gate, bastava trocar de botão para estrear um DRAFT ou republicar
 * um INATIVO sem passar por `reativarProduto` — o gate acima viraria decoração.
 */
describe('alterarAtivoLoteProdutos — ativar é publicar e usa o mesmo gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
    setProductStatusLoteActionMock.mockResolvedValue({ ok: true, atualizados: 1 })
    inMock.mockResolvedValue({
      data: [
        { id: RASCUNHO, status_publicacao: 'DRAFT' },
        { id: INATIVO, status_publicacao: 'INATIVO' },
      ],
    })
  })

  it('ativar publica só o rascunho e descarta o INATIVO', async () => {
    const { alterarAtivoLoteProdutos } = await import('./actions')
    const res = await alterarAtivoLoteProdutos([RASCUNHO, INATIVO], true)

    expect(res.success).toBe(true)
    expect(setProductStatusLoteActionMock).toHaveBeenCalledWith([RASCUNHO], 'PUBLICADO')
  })

  it('ativar só INATIVO falha — reativar é transição própria', async () => {
    inMock.mockResolvedValue({ data: [{ id: INATIVO, status_publicacao: 'INATIVO' }] })

    const { alterarAtivoLoteProdutos } = await import('./actions')
    const res = await alterarAtivoLoteProdutos([INATIVO], true)

    expect(res.success).toBe(false)
    expect(setProductStatusLoteActionMock).not.toHaveBeenCalled()
  })

  it('inativar não tem gate: qualquer status pode ir para INATIVO', async () => {
    const { alterarAtivoLoteProdutos } = await import('./actions')
    const res = await alterarAtivoLoteProdutos([RASCUNHO, PUBLICADO, INATIVO], false)

    expect(res.success).toBe(true)
    expect(setProductStatusLoteActionMock).toHaveBeenCalledWith(
      [RASCUNHO, PUBLICADO, INATIVO],
      'INATIVO',
    )
  })
})
