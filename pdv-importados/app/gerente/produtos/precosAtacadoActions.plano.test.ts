import { beforeEach, describe, expect, it, vi } from 'vitest'

const recursos = vi.hoisted(() => ({ v: null as string[] | null }))
const insert = vi.hoisted(() => vi.fn())
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession: async () => ({ ok: true }) }))
vi.mock('@/idioma/usuarioIdioma', () => ({ getUsuarioIdioma: async () => ({ idioma: 'pt' }) }))
vi.mock('@/lib/cobranca/bloqueioPorPlano', async () => {
  const { temRecurso } = await import('@/lib/cobranca/planos')
  return {
    recursosDaSessao: async () => recursos.v,
    erroSeSemRecurso: async (r: string) => (temRecurso(recursos.v, r as never) ? null : 'RECURSO_NAO_INCLUSO_NO_PLANO'),
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'neq', 'order']) q[m] = () => q
    q.maybeSingle = async () => ({ data: null })
    q.insert = (row: unknown) => { insert(row); return { select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) } }
    return { from: () => q }
  },
}))

import { atualizarFaixaAtacado, criarFaixaAtacado, faixasPermitidasNoPlano } from './precosAtacadoActions'

const P = '00000000-0000-4000-8000-000000000001'
const input = { produto_id: P, quantidade_minima: 10, preco_unitario: 5 }

describe('faixas de preço — gating por plano', () => {
  beforeEach(() => insert.mockReset())

  it('Básico (sem faixas_preco): criar e atualizar são recusados sem tocar no banco', async () => {
    recursos.v = ['pdv', 'estoque']
    expect(await faixasPermitidasNoPlano()).toBe(false)
    expect(await criarFaixaAtacado(input)).toMatchObject({ success: false, error: expect.stringContaining('RECURSO_NAO_INCLUSO') })
    expect(await atualizarFaixaAtacado({ ...input, id: P })).toMatchObject({ success: false })
    expect(insert).not.toHaveBeenCalled()
  })

  it('Atacado (com faixas_preco) cria normalmente', async () => {
    recursos.v = ['pdv', 'faixas_preco']
    expect(await criarFaixaAtacado(input)).toMatchObject({ success: true })
    expect(insert).toHaveBeenCalledOnce()
  })

  it('empresa sem assinatura (Empresa 1/legado, recursos null) continua liberada', async () => {
    recursos.v = null
    expect(await faixasPermitidasNoPlano()).toBe(true)
    expect(await criarFaixaAtacado(input)).toMatchObject({ success: true })
  })
})
