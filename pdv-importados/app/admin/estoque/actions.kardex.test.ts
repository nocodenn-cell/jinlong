import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROD = '3f2c1d4e-1111-4222-8333-444455556666'
const LOJA = 'a0000001-0000-4000-8000-000000000001'

let estoqueSaldo: number | null = 5
let todosDeltas: number[] = [10, -3, -2]

function tabela(nome: string) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(async () => ({ data: [{ id: 'u1', nome: 'Maria Souza' }], error: null }))
  chain.order = vi.fn(self)
  chain.limit = vi.fn(async () => ({
    data: [
      { evento_id: 'mel:2', ocorrido_em: '2026-09-30T12:00:00Z', tipo_codigo: 'VENDA', quantidade_delta: -2, observacao: null, produto_id: PROD, usuario_id: 'u1' },
      { evento_id: 'mel:1', ocorrido_em: '2026-09-29T12:00:00Z', tipo_codigo: 'VENDA', quantidade_delta: -3, observacao: null, produto_id: PROD, usuario_id: null },
    ],
    error: null,
  }))
  chain.range = vi.fn(async () => ({ data: todosDeltas.map((d) => ({ quantidade_delta: d })), error: null }))
  chain.maybeSingle = vi.fn(async () => ({ data: estoqueSaldo == null ? null : { quantidade_atual: estoqueSaldo }, error: null }))
  void nome
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (n: string) => tabela(n) }),
}))
vi.mock('@/lib/admin/auth/assertAdminSession', () => ({
  assertAdminSession: async () => ({ ok: true, session: { lojaId: LOJA } }),
}))
vi.mock('@/lib/auth/lojaUsuario', () => ({ LOJA_MATRIZ_ID: LOJA }))
vi.mock('@/lib/navigation/routes', () => ({ ROUTES: { admin: { estoque: '/admin/estoque' } } }))

const { obterKardexProduto } = await import('./actions')

beforeEach(() => {
  estoqueSaldo = 5
  todosDeltas = [10, -3, -2]
})

describe('obterKardexProduto — Usuário e Saldo após (UX-007)', () => {
  it('traz o nome do usuário e o saldo após cada movimento quando o histórico fecha com o estoque', async () => {
    const rows = await obterKardexProduto(PROD)
    expect(rows.map((r) => r.usuario_nome)).toEqual(['Maria Souza', null])
    expect(rows.map((r) => r.saldo_apos)).toEqual([5, 7])
  })

  it('histórico que não fecha com o saldo atual: saldo_apos fica null (não inventa)', async () => {
    estoqueSaldo = 9
    const rows = await obterKardexProduto(PROD)
    expect(rows.map((r) => r.saldo_apos)).toEqual([null, null])
  })

  it('sem linha de estoque: saldo_apos null', async () => {
    estoqueSaldo = null
    const rows = await obterKardexProduto(PROD)
    expect(rows.map((r) => r.saldo_apos)).toEqual([null, null])
  })

  it('total que estoura o teto de leitura (1000 linhas) não prova fechamento: saldo_apos null', async () => {
    todosDeltas = Array.from({ length: 1000 }, () => 0)
    const rows = await obterKardexProduto(PROD)
    expect(rows.map((r) => r.saldo_apos)).toEqual([null, null])
  })

  it('id inválido devolve lista vazia sem consultar', async () => {
    await expect(obterKardexProduto('x')).rejects.toThrow('Produto inválido')
  })
})
