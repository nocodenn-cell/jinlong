import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * listarHistoricoPrecos — leitura de historico_precos_produto (migração 259)
 * + resolução de nome do autor. Cobre: ordenação/dados retornados fielmente,
 * fallback de nome quando o usuário não resolve (RLS ou removido), e uso do
 * client admin (não o de sessão) para o lookup de nome — ver
 * historicoPrecosActions.ts para o porquê (RLS de `usuarios` é same-loja).
 */

const assertGerenteSessionMock = vi.fn()
const historicoSelectChain = { eq: vi.fn(), order: vi.fn(), limit: vi.fn() }
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
      if (table !== 'historico_precos_produto') throw new Error(`tabela inesperada: ${table}`)
      return {
        select: () => ({
          eq: historicoSelectChain.eq,
        }),
      }
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

describe('listarHistoricoPrecos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
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

  it('retorna vazio quando não há eventos — sem chamar o lookup de nomes', async () => {
    historicoSelectChain.limit.mockResolvedValue({ data: [], error: null })
    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)
    expect(r).toEqual({ success: true, data: [] })
    expect(adminUsuariosInMock).not.toHaveBeenCalled()
  })

  it('mapeia evento real fielmente: valores anterior/novo, autor e data — e usa o client admin para o nome', async () => {
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
    adminUsuariosInMock.mockResolvedValue({
      data: [
        { id: 'user-a', nome: 'Gerente A' },
        { id: 'user-b', nome: 'Gerente B' },
      ],
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
      alteradoEm: '2026-08-16T09:01:39.056216+00:00',
    })
    expect(r.data[1]).toMatchObject({ alteradoPorNome: 'Gerente A' })
    // Lookup de nome foi batelado (1 chamada, ambos os ids), não N+1.
    expect(adminUsuariosInMock).toHaveBeenCalledTimes(1)
    expect(adminUsuariosInMock).toHaveBeenCalledWith(
      'id',
      expect.arrayContaining(['user-a', 'user-b']),
    )
  })

  it('fallback "usuário removido" fica a cargo do chamador (UI) quando alteradoPorNome é null', async () => {
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
    // Usuário não retorna na consulta (removido de auth.users, FK SET NULL já
    // teria zerado alterado_por — mas testamos aqui o caso "id órfão ainda
    // presente e usuarios não devolve linha", que é o comportamento de
    // fallback do map de nomes em si).
    adminUsuariosInMock.mockResolvedValue({ data: [] })

    const { listarHistoricoPrecos } = await import('./historicoPrecosActions')
    const r = await listarHistoricoPrecos(PRODUTO_ID)

    expect(r.success).toBe(true)
    if (!r.success) throw new Error('esperava sucesso')
    expect(r.data[0].alteradoPorNome).toBeNull()
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
