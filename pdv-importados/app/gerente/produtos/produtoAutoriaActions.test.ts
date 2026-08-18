import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * obterAutoriaProduto — leitura de produtos.criado_por/atualizado_por +
 * resolução de nome. Cobre: gate de tenant produto→loja (a RLS de `produtos`
 * NÃO tem predicado de loja), mapeamento fiel, distinção entre "usuário
 * removido" (consulta ok, id não voltou) e "indisponível" (consulta falhou),
 * e uso do client de SESSÃO — não do admin — para o lookup de nomes.
 */

const assertGerenteSessionMock = vi.fn()
const produtosMaybeSingleMock = vi.fn()
const usuariosInMock = vi.fn()
/** Registra qual coluna foi pedida em cada `select` de `produtos`. */
const produtosSelectSpy = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: async () => ({ idioma: 'pt' }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'produtos') {
        return {
          select: (cols: string) => {
            produtosSelectSpy(cols)
            return { eq: () => ({ maybeSingle: produtosMaybeSingleMock }) }
          },
        }
      }
      if (table === 'usuarios') {
        return { select: () => ({ in: () => ({ returns: usuariosInMock }) }) }
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  }),
}))

/** Se a action voltar a importar o admin client, este mock explode o teste. */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client não deve ser usado para resolver nomes de autor')
  },
}))

const PRODUTO_ID = '11111111-1111-4111-8111-111111111111'
const LOJA_SESSAO = 'loja-1'
const OUTRA_LOJA = 'loja-2'

/** `produtos.select` é chamado 2x: gate de tenant (loja_id) e leitura de autoria. */
function mockProdutoNaLoja(lojaId: string, autoria: Record<string, unknown> | null) {
  produtosMaybeSingleMock
    .mockResolvedValueOnce({ data: { loja_id: lojaId }, error: null })
    .mockResolvedValueOnce({ data: autoria, error: null })
}

describe('obterAutoriaProduto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: LOJA_SESSAO, perfil: 'GERENTE', idioma: 'pt' },
    })
    usuariosInMock.mockResolvedValue({ data: [], error: null })
  })

  it('rejeita produtoId inválido sem consultar o banco', async () => {
    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto('nao-e-uuid')
    expect(r.success).toBe(false)
    expect(produtosMaybeSingleMock).not.toHaveBeenCalled()
  })

  describe('isolamento entre lojas (gate de tenant na camada de app)', () => {
    it('produto de OUTRA loja é recusado e a autoria nunca é lida', async () => {
      produtosMaybeSingleMock.mockResolvedValueOnce({
        data: { loja_id: OUTRA_LOJA },
        error: null,
      })

      const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
      const r = await obterAutoriaProduto(PRODUTO_ID)

      expect(r.success).toBe(false)
      if (r.success) throw new Error('esperava falha')
      expect(r.error).toContain('não encontrado nesta loja')
      // Só o gate consultou; a leitura de autoria não chegou a acontecer.
      expect(produtosMaybeSingleMock).toHaveBeenCalledTimes(1)
      expect(produtosSelectSpy).toHaveBeenCalledTimes(1)
      expect(produtosSelectSpy).toHaveBeenCalledWith('loja_id')
      expect(usuariosInMock).not.toHaveBeenCalled()
    })

    it('produto inexistente devolve a MESMA mensagem de outra loja (sem oráculo de enumeração)', async () => {
      produtosMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
      const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
      const r = await obterAutoriaProduto(PRODUTO_ID)
      expect(r.success).toBe(false)
      if (r.success) throw new Error('esperava falha')
      expect(r.error).toContain('não encontrado nesta loja')
    })

    it('falha de infraestrutura no gate NÃO autoriza (falha fechada)', async () => {
      produtosMaybeSingleMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'connection reset' },
      })
      const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
      const r = await obterAutoriaProduto(PRODUTO_ID)
      expect(r.success).toBe(false)
      expect(produtosMaybeSingleMock).toHaveBeenCalledTimes(1)
    })

    it('sessão sem lojaId é recusada', async () => {
      assertGerenteSessionMock.mockResolvedValue({
        ok: true,
        session: { userId: 'mgr-1', lojaId: null, perfil: 'GERENTE', idioma: 'pt' },
      })
      const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
      const r = await obterAutoriaProduto(PRODUTO_ID)
      expect(r.success).toBe(false)
      expect(produtosMaybeSingleMock).not.toHaveBeenCalled()
    })

    it('ADMIN é global: passa o gate sem consultar loja do produto', async () => {
      assertGerenteSessionMock.mockResolvedValue({
        ok: true,
        session: { userId: 'adm-1', lojaId: null, perfil: 'ADMIN', idioma: 'pt' },
      })
      produtosMaybeSingleMock.mockResolvedValueOnce({
        data: {
          criado_por: 'user-a',
          atualizado_por: 'user-a',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      })
      usuariosInMock.mockResolvedValue({ data: [{ id: 'user-a', nome: 'Admin' }], error: null })

      const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
      const r = await obterAutoriaProduto(PRODUTO_ID)

      expect(r.success).toBe(true)
      // Uma única consulta: a de autoria. O gate não precisou ler loja_id.
      expect(produtosSelectSpy).toHaveBeenCalledTimes(1)
      expect(produtosSelectSpy).not.toHaveBeenCalledWith('loja_id')
    })
  })

  it('create + update por autores diferentes: mapeia os dois nomes corretamente', async () => {
    mockProdutoNaLoja(LOJA_SESSAO, {
      criado_por: 'user-a',
      atualizado_por: 'user-b',
      created_at: '2026-08-16T08:57:40.110243+00:00',
      updated_at: '2026-08-16T08:57:48.761048+00:00',
    })
    usuariosInMock.mockResolvedValue({
      data: [
        { id: 'user-a', nome: 'Gerente A' },
        { id: 'user-b', nome: 'Gerente B' },
      ],
      error: null,
    })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r).toEqual({
      success: true,
      data: {
        criadoPorNome: 'Gerente A',
        criadoEm: '2026-08-16T08:57:40.110243+00:00',
        criadoPorIndisponivel: false,
        atualizadoPorNome: 'Gerente B',
        atualizadoEm: '2026-08-16T08:57:48.761048+00:00',
        atualizadoPorIndisponivel: false,
      },
    })
    // Batelado: uma única chamada para os dois ids, não duas.
    expect(usuariosInMock).toHaveBeenCalledTimes(1)
  })

  it('atualizado_por NULL (após ON DELETE SET NULL) → nome null e NÃO marcado indisponível', async () => {
    mockProdutoNaLoja(LOJA_SESSAO, {
      criado_por: 'user-a',
      atualizado_por: null,
      created_at: '2026-08-16T08:57:40.110243+00:00',
      updated_at: '2026-08-16T08:57:48.761048+00:00',
    })
    usuariosInMock.mockResolvedValue({ data: [{ id: 'user-a', nome: 'Gerente A' }], error: null })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data.atualizadoPorNome).toBeNull()
    expect(r.data.atualizadoPorIndisponivel).toBe(false)
    expect(r.data.criadoPorNome).toBe('Gerente A')
  })

  it('lookup de nomes FALHA → indisponivel=true (UI não pode afirmar "removido")', async () => {
    mockProdutoNaLoja(LOJA_SESSAO, {
      criado_por: 'user-a',
      atualizado_por: 'user-b',
      created_at: '2026-08-16T08:57:40.110243+00:00',
      updated_at: '2026-08-16T08:57:48.761048+00:00',
    })
    usuariosInMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data.criadoPorNome).toBeNull()
    expect(r.data.criadoPorIndisponivel).toBe(true)
    expect(r.data.atualizadoPorIndisponivel).toBe(true)
  })

  it('autor existe mas não voltou no lookup (consulta ok) → removido, não indisponível', async () => {
    mockProdutoNaLoja(LOJA_SESSAO, {
      criado_por: 'user-sumido',
      atualizado_por: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    usuariosInMock.mockResolvedValue({ data: [], error: null })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data.criadoPorNome).toBeNull()
    expect(r.data.criadoPorIndisponivel).toBe(false)
  })

  it('produto sem criado_por/atualizado_por (pré-migração) retorna nomes null sem lookup', async () => {
    mockProdutoNaLoja(LOJA_SESSAO, {
      criado_por: null,
      atualizado_por: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data.criadoPorNome).toBeNull()
    expect(r.data.atualizadoPorNome).toBeNull()
    expect(usuariosInMock).not.toHaveBeenCalled()
  })

  it('propaga erro de banco formatado com a seção correta', async () => {
    produtosMaybeSingleMock
      .mockResolvedValueOnce({ data: { loja_id: LOJA_SESSAO }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)
    expect(r.success).toBe(false)
    if (r.success) throw new Error('esperava falha')
    expect(r.error).toContain('Autoria do produto')
  })
})
