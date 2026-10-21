import { describe, expect, it, vi } from 'vitest'
import { aplicarVendedorAposVenda, lembrarVendedor, precisaDefinirVendedor, vendedorInicial } from './caixaVendedor'

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

describe('aplicarVendedorAposVenda (venda normal e recuperada após timeout)', () => {
  it('aplica o vendedor escolhido na venda recuperada', async () => {
    const definir = vi.fn().mockResolvedValue({ ok: true })
    expect(await aplicarVendedorAposVenda('v-1', 'op-1', 'vend-2', definir)).toBe(true)
    expect(definir).toHaveBeenCalledWith('v-1', 'vend-2')
  })
  it('vendedor = operador ou nenhum: não chama', async () => {
    const definir = vi.fn()
    expect(await aplicarVendedorAposVenda('v-1', 'op-1', 'op-1', definir)).toBe(true)
    expect(await aplicarVendedorAposVenda('v-1', 'op-1', null, definir)).toBe(true)
    expect(definir).not.toHaveBeenCalled()
  })
  it('falha/erro vira false sem lançar', async () => {
    expect(await aplicarVendedorAposVenda('v-1', 'op-1', 'vend-2', vi.fn().mockResolvedValue({ ok: false }))).toBe(false)
    expect(await aplicarVendedorAposVenda('v-1', 'op-1', 'vend-2', vi.fn().mockRejectedValue(new Error('rede')))).toBe(false)
  })
})

describe('CaixaPageClient: recuperação após timeout aplica o vendedor', () => {
  it('handleVerificarVendaPendente chama aplicarVendedorAposVenda com a venda recuperada', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./CaixaPageClient.tsx', import.meta.url), 'utf8')
    const ini = src.indexOf('const handleVerificarVendaPendente')
    const corpo = src.slice(ini, src.indexOf("res.code === 'VENDA_NAO_ENCONTRADA'", ini))
    expect(corpo).toContain('aplicarVendedorAposVenda(res.detalhe.id, userId, vendedorId, definirVendedorVendaCaixa)')
  })
})
