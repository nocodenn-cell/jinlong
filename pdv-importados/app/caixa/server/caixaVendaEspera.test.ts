import { describe, expect, it } from 'vitest'
import { formatNumeroVendaHistorico, nomeDoClienteJoined } from '@/app/caixa/server/caixaVendaEspera.impl'

describe('formatNumeroVendaHistorico', () => {
  it('formata prefixo curto do UUID em maiúsculas', () => {
    expect(formatNumeroVendaHistorico('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('#A1B2C3D4')
  })

  it('retorna traço para id vazio após normalização', () => {
    expect(formatNumeroVendaHistorico('')).toBe('—')
  })
})

describe('nomeDoClienteJoined', () => {
  it('extrai o nome quando o join vem como objeto', () => {
    expect(nomeDoClienteJoined({ nome: 'Maria Silva' })).toBe('Maria Silva')
  })

  it('extrai o nome quando o join vem como array (cardinalidade 1)', () => {
    expect(nomeDoClienteJoined([{ nome: 'João Souza' }])).toBe('João Souza')
  })

  it('retorna null quando a venda não tem cliente vinculado', () => {
    expect(nomeDoClienteJoined(null)).toBeNull()
    expect(nomeDoClienteJoined(undefined)).toBeNull()
    expect(nomeDoClienteJoined([])).toBeNull()
  })

  it('retorna null para nome vazio/whitespace', () => {
    expect(nomeDoClienteJoined({ nome: '' })).toBeNull()
    expect(nomeDoClienteJoined({ nome: '   ' })).toBeNull()
  })
})
