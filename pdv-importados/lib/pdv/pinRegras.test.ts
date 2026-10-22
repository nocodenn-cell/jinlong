import { describe, expect, it } from 'vitest'
import { statusPin, validarPinNovo } from './pinRegras'

describe('statusPin (badge Funcionários)', () => {
  const agora = Date.parse('2026-10-21T20:00:00Z')
  it('sem linha ⇒ sem PIN', () => expect(statusPin(null, agora)).toBe('sem'))
  it('sem bloqueio ⇒ ativo', () => expect(statusPin({ pin_bloqueado_ate: null }, agora)).toBe('ativo'))
  it('10 erros (infinity) ⇒ bloqueado', () => expect(statusPin({ pin_bloqueado_ate: 'infinity' }, agora)).toBe('bloqueado'))
  it('bloqueio de 5 min no futuro ⇒ bloqueado; já vencido ⇒ ativo', () => {
    expect(statusPin({ pin_bloqueado_ate: '2026-10-21T20:03:00+00:00' }, agora)).toBe('bloqueado')
    expect(statusPin({ pin_bloqueado_ate: '2026-10-21T19:59:00+00:00' }, agora)).toBe('ativo')
  })
})

describe('validarPinNovo (mesmas regras no cliente e no servidor)', () => {
  it('rejeita óbvios e aceita válido', () => {
    expect(validarPinNovo('1111', '1111')).toBe('obvio')
    expect(validarPinNovo('1234', '1234')).toBe('obvio')
    expect(validarPinNovo('12a4', '12a4')).toBe('formato')
    expect(validarPinNovo('7391', '7392')).toBe('confirmacao')
    expect(validarPinNovo('7391', '7391')).toBeNull()
  })
})
