import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * obterAutoriaProduto — leitura de produtos.criado_por/atualizado_por +
 * resolução de nome. Cobre: mapeamento fiel, fallback "usuário removido"
 * (nome null), e uso do client admin para o lookup de nome (mesma razão de
 * historicoPrecosActions: RLS de `usuarios` é same-loja, e o autor pode ser
 * de outra loja ou ter sido realocado).
 */

const assertGerenteSessionMock = vi.fn()
const produtosMaybeSingleMock = vi.fn()
const adminUsuariosInMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: async () => ({ idioma: 'pt' }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table !== 'produtos') throw new Error(`tabela inesperada: ${table}`)
      return { select: () => ({ eq: () => ({ maybeSingle: produtosMaybeSingleMock }) }) }
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'usuarios') throw new Error(`tabela inesperada: ${table}`)
      return { select: () => ({ in: adminUsuariosInMock }) }
    },
  }),
}))

const PRODUTO_ID = '11111111-1111-4111-8111-111111111111'

describe('obterAutoriaProduto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
  })

  it('rejeita produtoId inválido sem consultar o banco', async () => {
    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto('nao-e-uuid')
    expect(r.success).toBe(false)
    expect(produtosMaybeSingleMock).not.toHaveBeenCalled()
  })

  it('create + update por autores diferentes: mapeia os dois nomes corretamente', async () => {
    produtosMaybeSingleMock.mockResolvedValue({
      data: {
        criado_por: 'user-a',
        atualizado_por: 'user-b',
        created_at: '2026-08-16T08:57:40.110243+00:00',
        updated_at: '2026-08-16T08:57:48.761048+00:00',
      },
      error: null,
    })
    adminUsuariosInMock.mockResolvedValue({
      data: [
        { id: 'user-a', nome: 'Gerente A' },
        { id: 'user-b', nome: 'Gerente B' },
      ],
    })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r).toEqual({
      success: true,
      data: {
        criadoPorNome: 'Gerente A',
        criadoEm: '2026-08-16T08:57:40.110243+00:00',
        atualizadoPorNome: 'Gerente B',
        atualizadoEm: '2026-08-16T08:57:48.761048+00:00',
      },
    })
    // Batelado: uma única chamada para os dois ids, não duas.
    expect(adminUsuariosInMock).toHaveBeenCalledTimes(1)
  })

  it('atualizado_por NULL (após ON DELETE SET NULL do usuário removido) → nome null, fallback fica na UI', async () => {
    produtosMaybeSingleMock.mockResolvedValue({
      data: {
        criado_por: 'user-a',
        atualizado_por: null,
        created_at: '2026-08-16T08:57:40.110243+00:00',
        updated_at: '2026-08-16T08:57:48.761048+00:00',
      },
      error: null,
    })
    adminUsuariosInMock.mockResolvedValue({ data: [{ id: 'user-a', nome: 'Gerente A' }] })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data.atualizadoPorNome).toBeNull()
    expect(r.data.criadoPorNome).toBe('Gerente A')
  })

  it('produto sem criado_por/atualizado_por (pré-migração) retorna nomes null sem lookup', async () => {
    produtosMaybeSingleMock.mockResolvedValue({
      data: { criado_por: null, atualizado_por: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      error: null,
    })

    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data).toEqual({
      criadoPorNome: null,
      criadoEm: '2026-01-01T00:00:00Z',
      atualizadoPorNome: null,
      atualizadoEm: '2026-01-01T00:00:00Z',
    })
    expect(adminUsuariosInMock).not.toHaveBeenCalled()
  })

  it('produto inexistente retorna estado vazio sem erro', async () => {
    produtosMaybeSingleMock.mockResolvedValue({ data: null, error: null })
    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)
    expect(r).toEqual({
      success: true,
      data: { criadoPorNome: null, criadoEm: null, atualizadoPorNome: null, atualizadoEm: null },
    })
  })

  it('propaga erro de banco formatado com a seção correta', async () => {
    produtosMaybeSingleMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const { obterAutoriaProduto } = await import('./produtoAutoriaActions')
    const r = await obterAutoriaProduto(PRODUTO_ID)
    expect(r.success).toBe(false)
    if (r.success) throw new Error('esperava falha')
    expect(r.error).toContain('Autoria do produto')
  })
})
