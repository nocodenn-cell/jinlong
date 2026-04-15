import { describe, expect, it } from 'vitest'
import { formatDateTimeOrDash } from './datetime'

describe('formatDateTimeOrDash', () => {
  it('retorna traco para null, undefined, string vazia ou data invalida', () => {
    expect(formatDateTimeOrDash(null, 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash(undefined, 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash('', 'pt-BR')).toBe('—')
    expect(formatDateTimeOrDash('invalido', 'pt-BR')).toBe('—')
  })

  it('aceita Date valido e retorna texto nao vazio', () => {
    const s = formatDateTimeOrDash(new Date('2024-06-10T15:00:00.000Z'), 'en-CA', 'short')
    expect(s).not.toBe('—')
    expect(s.length).toBeGreaterThan(4)
  })

  it('aceita ISO string valida', () => {
    const s = formatDateTimeOrDash('2024-06-10T15:00:00.000Z', 'pt-BR', 'short')
    expect(s).not.toBe('—')
  })

  it('timeStyle medium ainda formata sem retornar traco', () => {
    const s = formatDateTimeOrDash('2024-06-10T15:30:45.000Z', 'pt-BR', 'medium')
    expect(s).not.toBe('—')
  })
})
