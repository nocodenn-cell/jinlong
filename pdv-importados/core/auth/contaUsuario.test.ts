import { describe, it, expect } from 'vitest'
import { isContaDesativada } from './contaUsuario'

describe('isContaDesativada', () => {
  it('bloqueia apenas quando ativo === false', () => {
    expect(isContaDesativada({ ativo: false })).toBe(true)
  })

  it('não bloqueia conta ativa', () => {
    expect(isContaDesativada({ ativo: true })).toBe(false)
  })

  it('leitura conservadora: ausente/indefinido não é desativado', () => {
    expect(isContaDesativada({ ativo: null })).toBe(false)
    expect(isContaDesativada({ ativo: undefined })).toBe(false)
    expect(isContaDesativada({})).toBe(false)
  })
})
