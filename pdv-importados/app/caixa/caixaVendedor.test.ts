import { describe, expect, it } from 'vitest'
import { lembrarVendedor, precisaDefinirVendedor, vendedorInicial } from './caixaVendedor'

function mem() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}
const lista = [{ id: 'op', nome: 'Caixa' }, { id: 'v1', nome: 'Vendedora' }]

describe('caixaVendedor', () => {
  it('padrão é o operador', () => {
    expect(vendedorInicial('op', lista, mem())).toBe('op')
  })
  it('lembra o último vendedor do operador', () => {
    const s = mem()
    lembrarVendedor('op', 'v1', s)
    expect(vendedorInicial('op', lista, s)).toBe('v1')
    lembrarVendedor('op', 'op', s)
    expect(s.m.size).toBe(0)
  })
  it('ignora vendedor lembrado que saiu da loja', () => {
    const s = mem()
    lembrarVendedor('op', 'sumiu', s)
    expect(vendedorInicial('op', lista, s)).toBe('op')
  })
  it('só define vendedor quando diferente do operador', () => {
    expect(precisaDefinirVendedor('op', 'op')).toBe(false)
    expect(precisaDefinirVendedor('op', null)).toBe(false)
    expect(precisaDefinirVendedor('op', 'v1')).toBe(true)
  })
})
