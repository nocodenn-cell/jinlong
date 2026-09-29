import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Timeline de auditoria: expõe os históricos que JÁ existem (preço de produto e
 * faixas de atacado) sem tabela nova. Testa a montagem dos eventos e o isolamento
 * por loja (join com `produtos.loja_id`).
 */

const assertAdminSessionMock = vi.fn()

vi.mock('@/lib/admin/auth/assertAdminSession', () => ({
  assertAdminSession: assertAdminSessionMock,
}))

type Chamada = { table: string; ops: Array<[string, unknown[]]> }
const chamadas: Chamada[] = []
const respostas: Record<string, { data: unknown[] | null; error: { message: string } | null }> = {}

function builder(table: string) {
  const chamada: Chamada = { table, ops: [] }
  chamadas.push(chamada)
  const proxy: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in']) {
    proxy[op] = (...args: unknown[]) => {
      chamada.ops.push([op, args])
      return proxy
    }
  }
  // Await no builder = resposta da tabela.
  proxy.then = (resolve: (v: unknown) => unknown) =>
    resolve(respostas[table] ?? { data: [], error: null })
  return proxy
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}))

const FILTRO = { inicio: null, fim: null, tipos: ['PRECO_PRODUTO'] as const, operadorId: null }

describe('listarEventosAuditoria — preços de produto e faixas de atacado', () => {
  beforeEach(() => {
    chamadas.length = 0
    for (const k of Object.keys(respostas)) delete respostas[k]
    assertAdminSessionMock.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-1', userId: 'u1' },
    })
  })

  it('monta evento de preço só com os campos que mudaram (null vira "—")', async () => {
    respostas.historico_precos_produto = {
      data: [
        {
          id: 'h1',
          produto_id: 'p1',
          preco_varejo_anterior: 10,
          preco_varejo_novo: 12,
          preco_atacado_anterior: 8,
          preco_atacado_novo: null, // atacado limpo: precisa continuar visível
          preco_custo_anterior: 5,
          preco_custo_novo: 5, // não mudou: não aparece
          alterado_por: 'u9',
          alterado_em: '2026-09-29T10:00:00Z',
        },
      ],
      error: null,
    }
    respostas.usuarios = { data: [{ id: 'u9', nome: 'Gerente Ana' }], error: null }
    respostas.produtos = { data: [{ id: 'p1', nome: 'Arroz' }], error: null }

    const { listarEventosAuditoria } = await import('./actions')
    const res = await listarEventosAuditoria(FILTRO)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.eventos).toHaveLength(1)
    const e = res.eventos[0]
    expect(e).toMatchObject({
      id: 'preco:h1',
      tipo: 'PRECO_PRODUTO',
      resumoCodigo: 'preco_produto',
      operadorNome: 'Gerente Ana',
    })
    expect(e.detalhe).toMatchObject({
      produto_nome: 'Arroz',
      preco_varejo_anterior: 10,
      preco_varejo_novo: 12,
      preco_atacado_anterior: 8,
      preco_atacado_novo: '—',
    })
    expect(e.detalhe).not.toHaveProperty('preco_custo_anterior')
    expect(e.detalhe).not.toHaveProperty('preco_custo_novo')
  })

  it('monta evento de faixa de atacado (criada / alterada / removida)', async () => {
    respostas.historico_tiers_crud = {
      data: [
        {
          id: 't1', produto_id: 'p1', acao: 'CRIADO',
          quantidade_minima_antes: null, quantidade_minima_depois: 6,
          preco_unitario_antes: null, preco_unitario_depois: 30,
          criado_por: null, criado_em: '2026-09-29T10:00:00Z',
        },
        {
          id: 't2', produto_id: 'p1', acao: 'ATUALIZADO',
          quantidade_minima_antes: 6, quantidade_minima_depois: 10,
          preco_unitario_antes: 30, preco_unitario_depois: 28,
          criado_por: null, criado_em: '2026-09-29T11:00:00Z',
        },
        {
          id: 't3', produto_id: 'p1', acao: 'DELETADO',
          quantidade_minima_antes: 10, quantidade_minima_depois: null,
          preco_unitario_antes: 28, preco_unitario_depois: null,
          criado_por: null, criado_em: '2026-09-29T12:00:00Z',
        },
      ],
      error: null,
    }

    const { listarEventosAuditoria } = await import('./actions')
    const res = await listarEventosAuditoria(FILTRO)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Ordem: mais recente primeiro.
    expect(res.eventos.map((e) => e.resumoCodigo)).toEqual([
      'faixa_atacado_removida',
      'faixa_atacado_atualizada',
      'faixa_atacado_criada',
    ])
    expect(res.eventos[0].resumoParams).toEqual({ qtd: 10 })
    expect(res.eventos[2].detalhe).toMatchObject({
      quantidade_minima_depois: 6,
      preco_unitario_depois: 30,
    })
  })

  it('isola por loja: as duas consultas filtram por produtos.loja_id', async () => {
    const { listarEventosAuditoria } = await import('./actions')
    await listarEventosAuditoria(FILTRO)

    for (const tabela of ['historico_precos_produto', 'historico_tiers_crud']) {
      const c = chamadas.find((x) => x.table === tabela)
      expect(c, tabela).toBeDefined()
      const eqs = c!.ops.filter(([op]) => op === 'eq').map(([, args]) => args)
      expect(eqs).toContainEqual(['produtos.loja_id', 'loja-1'])
      const sel = c!.ops.find(([op]) => op === 'select')![1][0] as string
      expect(sel).toContain('produtos!inner(loja_id)')
    }
  })

  it('não consulta os históricos de preço quando o filtro é de outro tipo', async () => {
    const { listarEventosAuditoria } = await import('./actions')
    await listarEventosAuditoria({ inicio: null, fim: null, tipos: ['ALERTA'], operadorId: null })
    expect(chamadas.some((c) => c.table === 'historico_precos_produto')).toBe(false)
    expect(chamadas.some((c) => c.table === 'historico_tiers_crud')).toBe(false)
  })

  it('fonte indisponível (erro/tabela sem policy) é ignorada, sem derrubar a timeline', async () => {
    respostas.historico_tiers_crud = { data: null, error: { message: 'permission denied' } }
    respostas.historico_precos_produto = { data: [], error: null }

    const { listarEventosAuditoria } = await import('./actions')
    const res = await listarEventosAuditoria(FILTRO)
    expect(res).toMatchObject({ ok: true, eventos: [] })
  })
})
