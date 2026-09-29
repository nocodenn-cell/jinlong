import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D0-01: a EDIÇÃO do cadastro não altera atacado. O form hidrata preço/quantidade
 * da faixa de entrada só para validar preço × varejo; reenviar esses valores faria
 * a RPC tratar a faixa de entrada como "o par do catálogo" (e poderia desativar ou
 * recriar faixas). Atacado muda pelo editor de faixas, pela criação ou pela
 * importação — nunca por uma edição comum.
 */

const assertGerenteSessionMock = vi.fn()
const atualizarProdutoActionMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status_publicacao: 'PUBLICADO' } }) }),
      }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

vi.mock('@/app/admin/produtos/actions', () => ({
  atualizarProdutoAction: atualizarProdutoActionMock,
  criarProdutoAction: vi.fn(),
  buscarProdutosComFiltrosAction: vi.fn(),
  buscarProdutoPorIdAction: vi.fn(),
  excluirProdutoAction: vi.fn(),
  setProductStatusAction: vi.fn(),
  setProductStatusLoteAction: vi.fn(),
  updateCategoriaLoteAction: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const PRODUTO = '11111111-1111-4111-8111-111111111111'

const formEdicao = {
  produto_id: PRODUTO,
  nome: 'Arroz',
  preco_varejo: 20,
  // Valores hidratados da faixa de entrada (não são "edição de atacado").
  preco_atacado: 15,
  quantidade_gatilho_atacado: 6,
  origem: 'china_manual',
  tem_nf: false,
}

describe('atualizarDadosProdutoGerente — edição não toca no atacado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
    atualizarProdutoActionMock.mockResolvedValue({ ok: true, product: {} })
  })

  it('não envia preço nem quantidade de atacado ao updater (chave ausente = não mexe)', async () => {
    const { atualizarDadosProdutoGerente } = await import('./actions')
    const res = await atualizarDadosProdutoGerente(formEdicao)

    expect(res.success).toBe(true)
    expect(atualizarProdutoActionMock).toHaveBeenCalledTimes(1)
    const [id, input] = atualizarProdutoActionMock.mock.calls[0]! as [string, Record<string, unknown>]
    expect(id).toBe(PRODUTO)
    expect(input.precoVarejo).toBe(20)
    expect(input.precoAtacado).toBeUndefined()
    expect(input.quantidadeGatilhoAtacado).toBeUndefined()
  })

  it('a validação preço de atacado < varejo continua valendo no servidor', async () => {
    const { atualizarDadosProdutoGerente } = await import('./actions')
    const res = await atualizarDadosProdutoGerente({ ...formEdicao, preco_varejo: 10, preco_atacado: 15 })

    expect(res.success).toBe(false)
    expect(atualizarProdutoActionMock).not.toHaveBeenCalled()
  })
})
