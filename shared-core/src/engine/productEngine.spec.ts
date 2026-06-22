import { describe, expect, it } from 'vitest'
import {
  evaluateProduct,
  statusInicialProduto,
  PRODUCT_RULES,
} from './productEngine'

describe('productEngine — motor único de decisão de produto', () => {
  it('evaluateProduct: vendável SSE ativo=true e status PUBLICADO', () => {
    expect(evaluateProduct({ ativo: true, status_publicacao: 'PUBLICADO' })).toEqual({
      ativo: true,
      status_publicacao: 'PUBLICADO',
      vendavel: true,
    })
    expect(evaluateProduct({ ativo: true, status_publicacao: 'DRAFT' }).vendavel).toBe(false)
    expect(evaluateProduct({ ativo: false, status_publicacao: 'PUBLICADO' }).vendavel).toBe(false)
    expect(evaluateProduct({ ativo: null, status_publicacao: null }).vendavel).toBe(false)
  })

  it('statusInicialProduto: human → PUBLICADO/ativo, import → DRAFT/inativo', () => {
    expect(statusInicialProduto('human')).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    expect(statusInicialProduto('import')).toEqual({ status_publicacao: 'DRAFT', ativo: false })
  })

  it('config declarativa expõe os requisitos de vendabilidade', () => {
    expect(PRODUCT_RULES.vendavel).toEqual({ ativo: true, status_publicacao: 'PUBLICADO' })
  })

  it('o status decidido para human é, por construção, vendável', () => {
    expect(evaluateProduct(statusInicialProduto('human')).vendavel).toBe(true)
    expect(evaluateProduct(statusInicialProduto('import')).vendavel).toBe(false)
  })
})
