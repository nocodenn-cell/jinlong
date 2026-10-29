import { describe, expect, it } from 'vitest'
import { autoatendimentoAtivo } from './autoatendimento'

describe('autoatendimento de assinatura (GROWTH-001)', () => {
  it('desligado por padrão: contratação passa pelo comercial', () => {
    expect(autoatendimentoAtivo({})).toBe(false)
    expect(autoatendimentoAtivo({ COBRANCA_AUTOATENDIMENTO: 'true' })).toBe(false)
    expect(autoatendimentoAtivo({ COBRANCA_AUTOATENDIMENTO: '0' })).toBe(false)
  })
  it('só liga com a flag explícita no servidor', () => {
    expect(autoatendimentoAtivo({ COBRANCA_AUTOATENDIMENTO: ' 1 ' })).toBe(true)
  })
})
