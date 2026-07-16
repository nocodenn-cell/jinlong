import { describe, it, expect } from 'vitest'
import {
  isRascunho,
  payloadStatusRascunho,
  podePublicarProduto,
} from './statusPublicacao'

describe('isRascunho', () => {
  it('true apenas para DRAFT', () => {
    expect(isRascunho('DRAFT')).toBe(true)
    expect(isRascunho('PUBLICADO')).toBe(false)
    expect(isRascunho('INATIVO')).toBe(false)
  })

  it('leitura pessimista: ausente não é rascunho', () => {
    expect(isRascunho(null)).toBe(false)
    expect(isRascunho(undefined)).toBe(false)
  })
})

describe('payloadStatusRascunho', () => {
  it('devolve o payload canônico de rascunho', () => {
    expect(payloadStatusRascunho()).toEqual({ status_publicacao: 'DRAFT' })
  })
})

describe('podePublicarProduto', () => {
  it('equivale a isRascunho (só rascunho é publicável)', () => {
    for (const status of ['DRAFT', 'PUBLICADO', 'INATIVO', null, undefined] as const) {
      expect(podePublicarProduto(status)).toBe(isRascunho(status))
    }
  })
})
