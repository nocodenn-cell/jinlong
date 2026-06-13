import { describe, expect, it } from 'vitest'
import {
  CONFIG_LOJA_ESCOPO_ERROR,
  CONFIG_LOJA_SESSAO_ERROR,
  validarLojaConfigScope,
} from './scope'

describe('configuracoes scope', () => {
  it('exige loja na sessão', () => {
    expect(validarLojaConfigScope('loja-1', null)).toBe(CONFIG_LOJA_SESSAO_ERROR)
  })

  it('bloqueia input sem loja quando obrigatório', () => {
    expect(
      validarLojaConfigScope(undefined, 'loja-1', { requireInput: true }),
    ).toBe(CONFIG_LOJA_ESCOPO_ERROR)
  })

  it('bloqueia loja divergente da sessão', () => {
    expect(validarLojaConfigScope('loja-2', 'loja-1')).toBe(CONFIG_LOJA_ESCOPO_ERROR)
  })

  it('aceita loja da própria sessão', () => {
    expect(validarLojaConfigScope(' loja-1 ', 'loja-1')).toBeNull()
  })
})
