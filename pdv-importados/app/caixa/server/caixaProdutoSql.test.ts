import { describe, expect, it } from 'vitest'
import { semAcento } from './caixaProdutoSql'

describe('semAcento — Onda 2 · Bloco 3 (busca accent-insensitive)', () => {
  it.each([
    ['café', 'cafe'],
    ['Café', 'Cafe'],
    ['CAFÉ', 'CAFE'],
    ['plástico', 'plastico'],
    ['coração', 'coracao'],
    ['Não', 'Nao'],
    ['ônibus', 'onibus'],
    ['àáâãäå', 'aaaaaa'],
    ['èéêë', 'eeee'],
    ['ìíîï', 'iiii'],
    ['òóôõö', 'ooooo'],
    ['ùúûü', 'uuuu'],
    ['çÇ', 'cC'],
  ])('%s → %s', (entrada, esperado) => {
    expect(semAcento(entrada)).toBe(esperado)
  })

  it('termo sem acento nenhum: idempotente (no-op)', () => {
    expect(semAcento('cadeira vermelha grande')).toBe('cadeira vermelha grande')
  })

  it('string vazia: retorna vazia', () => {
    expect(semAcento('')).toBe('')
  })

  it('não altera dígitos/símbolos (não interfere com busca por código)', () => {
    expect(semAcento('CAD-VERM-123')).toBe('CAD-VERM-123')
  })
})
