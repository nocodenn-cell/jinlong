/**
 * Matriz canônica Go-Live — presença de caminhos (não substitui P0-HOM humano).
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
    expect(cat).toContain('homologacao.dados')
  })
})

describe('P0 Financeiro + Fiscal Stub — telas canônicas', () => {
  it('financeiro unificado tem abas receber/pagar/fiscal', () => {
    expect(exists('app/admin/financeiro/page.tsx')).toBe(true)
    const nav = read('app/admin/financeiro/_components/FinanceiroTabNav.tsx')
    expect(nav).toContain("'receber'")
    expect(nav).toContain("'pagar'")
    expect(nav).toContain("'fiscal'")
  })

  it('AP não cria título manual — CTA aponta para import NF-e', () => {
    const src = read('app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx')
    expect(src).toContain('ROUTES.admin.importNfe')
    expect(src).toContain('origem_nfe_hint')
  })

  it('fila fiscal tem UI mínima Stub (aviso + sheet + detalhe)', () => {
    expect(exists('app/admin/financeiro/_components/FiscalStubNotice.tsx')).toBe(true)
    expect(exists('app/admin/financeiro/_components/DocumentoFiscalDetailSheet.tsx')).toBe(true)
    expect(exists('app/admin/financeiro/documento/[id]/page.tsx')).toBe(true)
    const content = read('app/admin/financeiro/_components/FinanceiroContent.tsx')
    expect(content).toContain('FiscalStubNotice')
  })

  it('implantacao exige grupo fiscal (stub XOR nfce)', () => {
    const cat = read('app/admin/implantacao/implantacaoCatalog.ts')
    expect(cat).toContain("fiscal.stub")
    expect(cat).toContain("fiscal.nfce")
    expect(cat).toContain("grupo: 'fiscal'")
  })
})

describe('P0 homologação — rotas do fluxo integrado', () => {
  it('estoque e venda admin existem para a cadeia operacional', () => {
    expect(exists('app/admin/estoque/page.tsx')).toBe(true)
    expect(exists('app/admin/vendas/page.tsx')).toBe(true)
    expect(exists('app/admin/estoque/importar-nfe/page.tsx')).toBe(true)
  })

  it('gate /admin/implantacao existe', () => {
    expect(exists('app/admin/implantacao/page.tsx')).toBe(true)
  })
})
