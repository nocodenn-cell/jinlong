/**
 * P0-VEN-PROOF / P0-VEN-REV — guarda de presença dos caminhos canônicos.
 * Homologação humana com dados reais permanece obrigatória (P0-HOM).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel))
}

describe('P0 venda — caminhos canônicos (matriz)', () => {
  it('finalização de venda usa RPC canônica', () => {
    expect(exists('app/caixa/server/caixaVendas.impl.ts')).toBe(true)
    const src = read('app/caixa/server/caixaVendas.impl.ts')
    expect(src).toMatch(/finalizar_venda/)
  })

  it('cancelamento usa cancelar_venda_transacional', () => {
    const src = read('app/caixa/server/caixaVendas.impl.ts')
    expect(src).toContain('cancelar_venda_transacional')
    expect(exists('app/caixa/server/cancelarVendaContrato.integration.test.ts')).toBe(true)
  })

  it('devolução/troca tem action e modal oficiais', () => {
    expect(exists('app/gerente/vendas/devolverOuTrocarVenda.impl.ts')).toBe(true)
    expect(exists('app/gerente/vendas/VendaDevolucaoModal.tsx')).toBe(true)
    const admin = read('app/admin/vendas/_components/VendaDetailSheet.tsx')
    expect(admin).toContain('VendaDevolucaoModal')
  })

  it('formas de pagamento do PDV incluem DINHEIRO e PIX', () => {
    const src = read('app/caixa/caixaMetodoPagamento.ts')
    expect(src).toContain('DINHEIRO')
    expect(src).toContain('PIX')
  })

  it('P0-DADOS: avaliador e item de implantação existem', () => {
    expect(exists('app/admin/implantacao/homologacaoDados.ts')).toBe(true)
    const cat = read('app/admin/implantacao/implantacaoCatalog.ts')
    expect(cat).toContain("homologacao.dados")
  })
})
