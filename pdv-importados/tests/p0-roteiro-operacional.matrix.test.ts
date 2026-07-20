/**
 * Onda 2 — roteiro operacional Go-Live (guarda de caminhos canônicos).
 * Não substitui homologação humana; bloqueia regressão de telas/RPCs críticas.
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

describe('Onda 2 — Cadastro', () => {
  it('telas oficiais de cadastro existem', () => {
    expect(exists('app/admin/catalogo/page.tsx')).toBe(true)
    expect(exists('app/admin/clientes/page.tsx')).toBe(true)
    expect(exists('app/admin/fornecedores/page.tsx')).toBe(true)
    expect(exists('app/admin/funcionarios/page.tsx')).toBe(true)
  })
})

describe('Onda 2 — Caixa / Venda', () => {
  it('abrir/fechar caixa usam writers canônicos', () => {
    const session = read('app/caixa/server/cashSession.ts')
    expect(session).toMatch(/fechar_caixa/)
    expect(exists('app/caixa/page.tsx')).toBe(true)
  })

  it('sangria/suprimento usam registrar_movimentacao', () => {
    const mov = read('app/caixa/server/cashMovementWriter.ts')
    expect(mov).toContain('registrar_movimentacao')
    const menu = read('app/caixa/CaixaPdvOperacoesMenu.tsx')
    expect(menu).toContain('sangria')
    expect(menu).toContain('suprimento')
  })

  it('desconto de gerente tem validação no finalize', () => {
    const v = read('app/caixa/finalizarVendaValidation.ts')
    expect(v).toContain('descontoGerentePercentual')
    expect(v).toContain('descontoGerenteToken')
  })

  it('venda DINHEIRO/PIX + finalize canônico', () => {
    const pag = read('app/caixa/caixaMetodoPagamento.ts')
    expect(pag).toContain('DINHEIRO')
    expect(pag).toContain('PIX')
    expect(read('app/caixa/server/caixaVendas.impl.ts')).toMatch(/finalizar_venda/)
  })

  it('cancelamento e devolução oficiais', () => {
    expect(read('app/caixa/server/caixaVendas.impl.ts')).toContain('cancelar_venda_transacional')
    expect(exists('app/gerente/vendas/devolverOuTrocarVenda.impl.ts')).toBe(true)
    expect(exists('app/admin/vendas/page.tsx')).toBe(true)
  })
})

describe('Onda 2 — Estoque', () => {
  it('estoque e import NF-e oficiais', () => {
    expect(exists('app/admin/estoque/page.tsx')).toBe(true)
    expect(exists('app/admin/estoque/importar-nfe/page.tsx')).toBe(true)
    expect(exists('app/admin/estoque/recebimento/page.tsx')).toBe(true)
  })
})

describe('Onda 2 — Financeiro', () => {
  it('AR liquidação via RPC canônica', () => {
    const w = read('app/admin/financeiro/receivableWriter.ts')
    expect(w).toContain('registrar_liquidacao_receber')
    const ui = read('app/admin/financeiro/_components/FinanceiroReceberExtras.tsx')
    expect(ui).toContain('liquidarTitulo')
  })

  it('AP pagar/cancelar e origem NF-e', () => {
    expect(exists('app/gerente/financeiro/contas-pagar/PagamentoModal.tsx')).toBe(true)
    const list = read('app/gerente/financeiro/contas-pagar/ContasPagarListClient.tsx')
    expect(list).toContain('ROUTES.admin.importNfe')
    expect(list).toMatch(/onCancelar|cancelarContaPagar/)
  })
})

describe('Onda 2 — Fiscal Stub', () => {
  it('enqueue pós-venda em Stub + fila admin', () => {
    const enq = read('app/caixa/server/caixaFiscalEnqueueServer.ts')
    expect(enq).toContain('NFC_E_STUB')
    expect(enq).toContain('fiscal_enfileirar_documento_venda')
    expect(exists('app/admin/financeiro/_components/FiscalStubNotice.tsx')).toBe(true)
  })
})

describe('Onda 2 — Auditoria + gate', () => {
  it('auditoria e implantação existem', () => {
    expect(exists('app/admin/auditoria/page.tsx')).toBe(true)
    expect(exists('app/admin/implantacao/page.tsx')).toBe(true)
    const cat = read('app/admin/implantacao/implantacaoCatalog.ts')
    expect(cat).toContain('operacao.venda')
    expect(cat).toContain('operacao.cancelamento')
    expect(cat).toContain('homologacao.fluxo_completo')
    expect(cat).toContain('homologacao.execucao_1')
    expect(cat).toContain('homologacao.execucao_2')
  })

  it('implantação exige evidência e tem timeline', () => {
    expect(exists('app/admin/implantacao/evidenciaImplantacao.ts')).toBe(true)
    expect(exists('app/admin/implantacao/ImplantacaoTimeline.tsx')).toBe(true)
    const actions = read('app/admin/implantacao/actions.ts')
    expect(actions).toContain('erroEvidenciaConcluido')
  })
})
