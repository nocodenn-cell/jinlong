import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUsuarioAtual = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/usuarioAtual', () => ({ getUsuarioAtual }))

const createClient = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createClient }))

const { listarVendasEmEsperaImpl } = await import('./caixaVendaEspera.impl')

beforeEach(() => {
  getUsuarioAtual.mockResolvedValue({ userId: 'op-1', idioma: 'pt' })
})

describe('listarVendasEmEsperaImpl — status da lista', () => {
  it('marca RETOMADA e trata linha antiga sem status como EM_ESPERA', async () => {
    createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { id: 'presa', numero_local: 2, totais: { totalLiquido: 15 }, qtd_itens: 1, status: 'RETOMADA' },
          { id: 'aberta', numero_local: 3, totais: { totalLiquido: 8 }, qtd_itens: 2 },
        ],
        error: null,
      }),
    })

    const res = await listarVendasEmEsperaImpl()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.vendas.map((v) => [v.id, v.status])).toEqual([
      ['presa', 'RETOMADA'],
      ['aberta', 'EM_ESPERA'],
    ])
  })
})
