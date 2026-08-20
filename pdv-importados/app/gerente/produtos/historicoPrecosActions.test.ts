import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * listarHistoricoPrecos — leitura de historico_precos_produto (migração 259)
 * + resolução de nome do autor. Cobre: gate de tenant produto→loja (a policy
 * `historico_precos_produto_leitura` só checa perfil, sem predicado de loja),
 * mapeamento fiel, distinção entre "removido" e "indisponível", e uso do
 * client de SESSÃO — não do admin — para o lookup de nomes.
 */

const assertGerenteSessionMock = vi.fn()
const historicoSelectChain = { eq: vi.fn(), order: vi.fn(), limit: vi.fn() }
const usuariosInMock = vi.fn()
const produtoGateMaybeSingleMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: async () => ({ idioma: 'pt' }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'historico_precos_produto') {
        return { select: () => ({ eq: historicoSelectChain.eq }) }
      }
      if (table === 'produtos') {
        return { select: () => ({ eq: () => ({ maybeSingle: produtoGateMaybeSingleMock }) }) }
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

describe('listarHistoricoPrecos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: LOJA_SESSAO, perfil: 'GERENTE', idioma: 'pt' },
    })
    // Por padrão o gate aprova: produto é da loja da sessão.
    produtoGateMaybeSingleMock.mockResolvedValue({ data: { loja_id: LOJA_SESSAO }, error: null })
    usuariosInMock.mockResolvedValue({ data: [], error: null })
    // encadeamento .eq().order().limit()
    historicoSelectChain.eq.mockReturnValue({ order: historicoSelectChain.order })
    historicoSelectChain.order.mockReturnValue({ limit: historicoSelectChain.limit })
  })

  it('rejeita produtoId inválido sem consultar o banco', async () => {
    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos('nao-e-uuid')
    expect(r.success).toBe(false)
    expect(historicoSelectChain.eq).not.toHaveBeenCalled()
  })

  describe('isolamento entre lojas (gate de tenant na camada de app)', () => {
    it('produto de OUTRA loja é recusado e o histórico nunca é lido', async () => {
      produtoGateMaybeSingleMock.mockResolvedValue({ data: { loja_id: OUTRA_LOJA }, error: null })

      const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
      const r = await listarHistoricoPrecos(PRODUTO_ID)

      expect(r.success).toBe(false)
      if (r.success) throw new Error('esperava falha')
      expect(r.error).toContain('não encontrado nesta loja')
      expect(historicoSelectChain.eq).not.toHaveBeenCalled()
      expect(usuariosInMock).not.toHaveBeenCalled()
    })

    it('produto inexistente devolve a MESMA mensagem de outra loja', async () => {
      produtoGateMaybeSingleMock.mockResolvedValue({ data: null, error: null })
      const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
      const r = await listarHistoricoPrecos(PRODUTO_ID)
      expect(r.success).toBe(false)
      if (r.success) throw new Error('esperava falha')
      expect(r.error).toContain('não encontrado nesta loja')
    })

    it('falha de infraestrutura no gate NÃO autoriza (falha fechada)', async () => {
      produtoGateMaybeSingleMock.mockResolvedValue({
        data: null,
        error: { message: 'connection reset' },
      })
      const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
      const r = await listarHistoricoPrecos(PRODUTO_ID)
      expect(r.success).toBe(false)
      expect(historicoSelectChain.eq).not.toHaveBeenCalled()
    })
  })

  it('retorna vazio quando não há eventos — sem chamar o lookup de nomes', async () => {
    historicoSelectChain.limit.mockResolvedValue({ data: [], error: null })
    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)
    expect(r).toEqual({ success: true, data: [] })
    expect(usuariosInMock).not.toHaveBeenCalled()
  })

  it('mapeia evento real fielmente: valores anterior/novo, autor e data', async () => {
    historicoSelectChain.limit.mockResolvedValue({
      data: [
        {
          id: 'evt-2',
          preco_varejo_anterior: 65,
          preco_varejo_novo: 70,
          preco_atacado_anterior: null,
          preco_atacado_novo: 60,
          preco_custo_anterior: null,
          preco_custo_novo: null,
          alterado_por: 'user-b',
          alterado_em: '2026-08-16T09:01:39.056216+00:00',
        },
        {
          id: 'evt-1',
          preco_varejo_anterior: 50,
          preco_varejo_novo: 65,
          preco_atacado_anterior: null,
          preco_atacado_novo: null,
          preco_custo_anterior: null,
          preco_custo_novo: null,
          alterado_por: 'user-a',
          alterado_em: '2026-08-16T09:01:39.049281+00:00',
        },
      ],
      error: null,
    })
    usuariosInMock.mockResolvedValue({
      data: [
        { id: 'user-a', nome: 'Gerente A' },
        { id: 'user-b', nome: 'Gerente B' },
      ],
      error: null,
    })

    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    // Ordem preservada tal como veio do banco (a query já ordena DESC por alterado_em).
    expect(r.data.map((e) => e.id)).toEqual(['evt-2', 'evt-1'])
    expect(r.data[0]).toMatchObject({
      precoVarejoAnterior: 65,
      precoVarejoNovo: 70,
      precoAtacadoAnterior: null,
      precoAtacadoNovo: 60,
      alteradoPorNome: 'Gerente B',
      alteradoPorIndisponivel: false,
      alteradoEm: '2026-08-16T09:01:39.056216+00:00',
    })
    expect(r.data[1]).toMatchObject({ alteradoPorNome: 'Gerente A' })
    // Lookup de nome foi batelado (1 chamada, ambos os ids), não N+1.
    expect(usuariosInMock).toHaveBeenCalledTimes(1)
  })

  it('autor não retorna no lookup (consulta ok) → removido, não indisponível', async () => {
    historicoSelectChain.limit.mockResolvedValue({
      data: [
        {
          id: 'evt-1',
          preco_varejo_anterior: 65,
          preco_varejo_novo: 70,
          preco_atacado_anterior: null,
          preco_atacado_novo: null,
          preco_custo_anterior: null,
          preco_custo_novo: null,
          alterado_por: 'user-excluido',
          alterado_em: '2026-08-16T09:01:39.056216+00:00',
        },
      ],
      error: null,
    })
    usuariosInMock.mockResolvedValue({ data: [], error: null })

    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data[0].alteradoPorNome).toBeNull()
    expect(r.data[0].alteradoPorIndisponivel).toBe(false)
  })

  it('lookup de nomes FALHA → indisponivel=true (UI não pode afirmar "removido")', async () => {
    historicoSelectChain.limit.mockResolvedValue({
      data: [
        {
          id: 'evt-1',
          preco_varejo_anterior: 65,
          preco_varejo_novo: 70,
          preco_atacado_anterior: null,
          preco_atacado_novo: null,
          preco_custo_anterior: null,
          preco_custo_novo: null,
          alterado_por: 'user-a',
          alterado_em: '2026-08-16T09:01:39.056216+00:00',
        },
      ],
      error: null,
    })
    usuariosInMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data[0].alteradoPorNome).toBeNull()
    expect(r.data[0].alteradoPorIndisponivel).toBe(true)
  })

  it('propaga erro de banco formatado com a seção correta', async () => {
    historicoSelectChain.limit.mockResolvedValue({
      data: null,
      error: { message: 'connection reset' },
    })
    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)
    expect(r.success).toBe(false)
    if (r.success) throw new Error('esperava falha')
    expect(r.error).toContain('Histórico de preços')
  })
})
