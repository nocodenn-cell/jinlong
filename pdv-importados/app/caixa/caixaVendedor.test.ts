import { describe, expect, it, vi } from 'vitest'
import { aplicarVendedorAposVenda, precisaDefinirVendedor, vendedorInicial } from './caixaVendedor'

describe('caixaVendedor', () => {
  it('padrão é o operador', () => {
    expect(vendedorInicial('op')).toBe('op')
    expect(vendedorInicial(null)).toBeNull()
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

describe('CaixaPageClient: vendedor não passa de uma venda para a outra', () => {
  it('depois de aplicar o vendedor, a próxima venda volta ao operador (venda normal e recuperada)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./CaixaPageClient.tsx', import.meta.url), 'utf8')
    const aplicacoes = src.split('aplicarVendedorAposVenda(').length - 1
    const resets = src.split('setVendedorId(vendedorInicial(userId))').length - 1
    // 1 reset na carga inicial + 1 depois de cada aplicação do vendedor
    expect(resets).toBe(aplicacoes + 1)
    expect(src).not.toContain('localStorage.setItem(`jl:caixa:vendedor')
    expect(src).not.toContain('lembrarVendedor')
  })
})
