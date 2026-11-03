import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/app/caixa/server/caixaErroOperador', () => ({
  idiomaOperadorParaErro: async () => 'pt',
}))
vi.mock('@/lib/sentry/vendaSentry', () => ({ captureMessage: vi.fn() }))

import { recalcularItensNoServidor } from './caixaPrecoAutoritativoServer'

const PRODUTO_ID = '11111111-1111-4111-8111-111111111111'

/** Supabase falso: versão de pricing ausente, produto ativo com varejo 22,50 (UN), sem faixa de atacado. */
function supabaseFalso() {
  const produto = {
    id: PRODUTO_ID,
    nome: 'USB-C',
    preco_varejo: 22.5,
    ativo: true,
    status_publicacao: 'PUBLICADO',
    unidade_medida: 'UN',
  }
  return {
    rpc: vi.fn(async (nome: string) => {
      if (nome === 'obter_pricing_version_ativa') return { data: null, error: null }
      return { data: null, error: null }
    }),
    from: vi.fn(() => ({
      select: () => ({ in: async () => ({ data: [produto], error: null }) }),
    })),
  }
}

describe('recalcularItensNoServidor — desconto manual (PDV-100.1, segurança)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mede o desconto contra o varejo do servidor, não contra o precoOriginal do cliente', async () => {
    const supabase = supabaseFalso()
    const r = await recalcularItensNoServidor(
      supabase as never,
      [{ produtoId: PRODUTO_ID, quantidade: 1, precoOriginal: 5, precoUnitario: 5, tipoPreco: 'MANUAL' }],
      'a0000001-0000-4000-8000-000000000001',
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Antes da correção, o original enviado (5) fazia o desconto parecer zero.
    expect(r.itens[0].precoOriginal).toBe(22.5)
    expect(r.itens[0].descontoUnitario).toBe(17.5)
  })

  it('rejeita preço manual acima do varejo do servidor', async () => {
    const supabase = supabaseFalso()
    const r = await recalcularItensNoServidor(
      supabase as never,
      [{ produtoId: PRODUTO_ID, quantidade: 1, precoOriginal: 30, precoUnitario: 30, tipoPreco: 'MANUAL' }],
      'a0000001-0000-4000-8000-000000000001',
    )
    expect(r.ok).toBe(false)
  })
})
