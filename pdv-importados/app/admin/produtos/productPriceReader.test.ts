import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import {
  coerceCalcularPrecoRpcRow,
  createProductPriceReader,
  mapRpcToPriceResolution,
} from './productPriceReader'

describe('productPriceReader — mapping (RPC → PriceResolutionResult)', () => {
  it('varejo: preserva fonte varejo', () => {
    const { price } = mapRpcToPriceResolution({
      preco: 10.5,
      tipo: 'VAREJO',
      fonte: 'varejo',
      regra_id: null,
    })
    expect(price).toEqual({
      preco: 10.5,
      tipo: 'VAREJO',
      fonte: 'varejo',
    })
    expect(price?.regraId).toBeUndefined()
  })

  it('atacado tier: preserva fonte tier e regra_id', () => {
    const { price } = mapRpcToPriceResolution({
      preco: '8.00',
      tipo: 'ATACADO',
      fonte: 'tier',
      regra_id: 'faixa-1',
    })
    expect(price).toEqual({
      preco: 8,
      tipo: 'ATACADO',
      fonte: 'tier',
      regraId: 'faixa-1',
    })
  })

  it('fallback atacado catálogo: fonte catalogo sem regra', () => {
    const { price } = mapRpcToPriceResolution({
      preco: 9,
      tipo: 'ATACADO',
      fonte: 'catalogo',
      regra_id: null,
    })
    expect(price).toEqual({
      preco: 9,
      tipo: 'ATACADO',
      fonte: 'catalogo',
    })
    expect(price?.regraId).toBeUndefined()
  })

  it('coerce aceita JSON string da RPC', () => {
    const row = coerceCalcularPrecoRpcRow(
      JSON.stringify({ preco: 1, tipo: 'VAREJO', fonte: 'varejo', regra_id: null }),
    )
    expect(row?.fonte).toBe('varejo')
    expect(mapRpcToPriceResolution(row).price?.fonte).toBe('varejo')
  })

  it('erro domínio produto_nao_encontrado', () => {
    expect(mapRpcToPriceResolution({ erro: 'produto_nao_encontrado' })).toEqual({
      price: null,
      domainError: 'produto_nao_encontrado',
    })
  })

  it('erro domínio quantidade_invalida', () => {
    expect(mapRpcToPriceResolution({ erro: 'quantidade_invalida' })).toEqual({
      price: null,
      domainError: 'quantidade_invalida',
    })
  })
})

describe('createProductPriceReader — RPC adapter', () => {
  function mockRpc(result: { data: unknown; error: { message: string } | null }) {
    return {
      rpc: vi.fn(async () => result),
    } as never
  }

  it('varejo via RPC ok', async () => {
    const supabase = mockRpc({
      data: { preco: 12, tipo: 'VAREJO', fonte: 'varejo', regra_id: null },
      error: null,
    })
    const reader = createProductPriceReader(supabase)
    const r = await reader.resolveEffectivePrice({
      produtoId: 'p1',
      quantidade: 1,
      lojaId: 'l1',
    })
    expect(r).toEqual({
      ok: true,
      price: { preco: 12, tipo: 'VAREJO', fonte: 'varejo' },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('calcular_preco_produto', {
      p_produto_id: 'p1',
      p_quantidade: 1,
      p_loja_id: 'l1',
    })
  })

  it('atacado tier via RPC ok', async () => {
    const supabase = mockRpc({
      data: { preco: 7.5, tipo: 'ATACADO', fonte: 'tier', regra_id: 't1' },
      error: null,
    })
    const reader = createProductPriceReader(supabase)
    const r = await reader.resolveEffectivePrice({
      produtoId: 'p1',
      quantidade: 10,
      lojaId: 'l1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.price.fonte).toBe('tier')
      expect(r.price.tipo).toBe('ATACADO')
      expect(r.price.regraId).toBe('t1')
    }
  })

  it('quantidade inválida não chama RPC', async () => {
    const supabase = mockRpc({ data: null, error: null })
    const reader = createProductPriceReader(supabase)
    await expect(
      reader.resolveEffectivePrice({ produtoId: 'p1', quantidade: 0, lojaId: 'l1' }),
    ).resolves.toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.QTY_INVALID,
      code: PRODUCT_ERROR_CODES.QTY_INVALID,
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('erro RPC supabase', async () => {
    const supabase = mockRpc({ data: null, error: { message: 'boom' } })
    const reader = createProductPriceReader(supabase)
    await expect(
      reader.resolveEffectivePrice({ produtoId: 'p1', quantidade: 1, lojaId: 'l1' }),
    ).resolves.toEqual({ ok: false, error: 'boom' })
  })

  it('erro produto inexistente no payload', async () => {
    const supabase = mockRpc({
      data: { erro: 'produto_nao_encontrado' },
      error: null,
    })
    const reader = createProductPriceReader(supabase)
    await expect(
      reader.resolveEffectivePrice({ produtoId: 'missing', quantidade: 1, lojaId: 'l1' }),
    ).resolves.toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.PRICE_PRODUCT_NOT_FOUND,
      code: PRODUCT_ERROR_CODES.PRICE_PRODUCT_NOT_FOUND,
    })
  })

  it('payload inválido → erro genérico', async () => {
    const supabase = mockRpc({ data: { preco: null, tipo: 'VAREJO' }, error: null })
    const reader = createProductPriceReader(supabase)
    await expect(
      reader.resolveEffectivePrice({ produtoId: 'p1', quantidade: 1, lojaId: 'l1' }),
    ).resolves.toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.PRICE_RESPONSE_INVALID,
      code: PRODUCT_ERROR_CODES.PRICE_RESPONSE_INVALID,
    })
  })
})
