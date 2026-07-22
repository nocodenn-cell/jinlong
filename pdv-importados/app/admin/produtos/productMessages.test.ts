import { describe, expect, it } from 'vitest'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import { resolveAppMessage } from '@/i18n/catalogAdapter'
import {
  localizeProductFailure,
  resolveProductMessage,
  resolveProductMessageDetailed,
} from './productMessages'

describe('productMessages — i18n borda (Products 8)', () => {
  it('locale pt-BR: code → catálogo pt', () => {
    expect(resolveProductMessage('pt', PRODUCT_ERROR_CODES.NAME_INVALID)).toBe(
      'O nome deve ter pelo menos 2 caracteres.',
    )
    expect(resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND)).toBe(
      'Produto não encontrado.',
    )
  })

  it('locale zh-CN: code → catálogo zh', () => {
    const nome = resolveProductMessage('zh', PRODUCT_ERROR_CODES.NAME_INVALID)
    expect(nome).not.toBe('O nome deve ter pelo menos 2 caracteres.')
    expect(nome.length).toBeGreaterThan(0)

    const nf = resolveProductMessage('zh-CN', PRODUCT_ERROR_CODES.NOT_FOUND)
    expect(nf).toBe('未找到商品。')
  })

  it('fallback en-US → pt-BR', () => {
    expect(resolveProductMessage('en-US', PRODUCT_ERROR_CODES.NOT_FOUND)).toBe(
      'Produto não encontrado.',
    )
    const detailed = resolveProductMessageDetailed('en-US', PRODUCT_ERROR_CODES.PRICE_INVALID)
    expect(detailed.missing).toBe(false)
    expect(detailed.resolvedLocale).toBe('pt-BR')
    expect(detailed.value).toBe('Preço de varejo inválido.')
  })

  it('chave ausente → missing + devolve a key', () => {
    const missing = resolveAppMessage('pt-BR', 'produtos.err_chave_inexistente_teste')
    expect(missing.missing).toBe(true)
    expect(missing.value).toBe('produtos.err_chave_inexistente_teste')
  })

  it('erro desconhecido (code inválido) → err_desconhecido', () => {
    const pt = resolveProductMessage('pt', 'PRODUCT_CODE_QUE_NAO_EXISTE')
    expect(pt).toBe('Erro de produto desconhecido.')
    const zh = resolveProductMessage('zh', 'PRODUCT_CODE_QUE_NAO_EXISTE')
    expect(zh).toBe('未知商品错误。')
    expect(zh).not.toBe(pt)
  })

  it('localizeProductFailure usa code quando presente', () => {
    expect(
      localizeProductFailure('zh', {
        error: 'O nome deve ter pelo menos 2 caracteres.',
        code: PRODUCT_ERROR_CODES.NAME_INVALID,
      }),
    ).toEqual({
      ok: false,
      error: resolveProductMessage('zh', PRODUCT_ERROR_CODES.NAME_INVALID),
    })
  })

  it('localizeProductFailure preserva error sem code (infra)', () => {
    expect(
      localizeProductFailure('zh', { error: 'connection reset' }),
    ).toEqual({ ok: false, error: 'connection reset' })
  })

  it('LIST_FAILED e LIFECYCLE_FAILED resolvem PT/ZH', () => {
    expect(resolveProductMessage('pt', PRODUCT_ERROR_CODES.LIST_FAILED)).toBe(
      'Não foi possível listar os produtos.',
    )
    expect(resolveProductMessage('zh', PRODUCT_ERROR_CODES.LIFECYCLE_FAILED)).toBe(
      '无法更改商品状态。',
    )
  })
})
