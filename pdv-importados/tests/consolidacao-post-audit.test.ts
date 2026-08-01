import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_GERENTE_REDIRECTS,
  ROUTES,
  pathWithQuery,
} from '@shared-core/navigation/routes'
import { TELAS_POR_EVENTO } from '@/lib/navigation/revalidarDominio'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel))
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('consolidação pós-audit — contratos de rota e código morto', () => {
  it('remove FinanceiroPanels e NovoProdutoClientPage (código morto)', () => {
    expect(exists('app/admin/financeiro/_components/FinanceiroPanels.tsx')).toBe(false)
    expect(exists('app/admin/catalogo/novo/NovoProdutoClientPage.tsx')).toBe(false)
  })

  it('/admin/catalogo/novo redireciona para ?modal=novo no catálogo', () => {
    const src = read('app/admin/catalogo/novo/page.tsx')
    expect(src).toContain('modal')
    expect(src).toContain('ROUTES.admin.catalogo')
    expect(src).toContain('redirect(')
  })

  it('redirects legados gerente → admin canônico', () => {
    expect(LEGACY_GERENTE_REDIRECTS.clientes).toBe(ROUTES.admin.clientes)
    expect(LEGACY_GERENTE_REDIRECTS.fornecedores).toBe(ROUTES.admin.fornecedores)
    expect(LEGACY_GERENTE_REDIRECTS.vendas).toBe(ROUTES.admin.vendas)
    expect(LEGACY_GERENTE_REDIRECTS.financeiro).toBe(ROUTES.admin.financeiro)
    expect(LEGACY_GERENTE_REDIRECTS['financeiro/contas-pagar']).toBe(
      ROUTES.admin.financeiroContasPagar,
    )
    expect(LEGACY_GERENTE_REDIRECTS.produtos).toBe(ROUTES.admin.catalogo)
    expect(LEGACY_GERENTE_REDIRECTS['produtos/novo']).toBe(ROUTES.admin.catalogoNovo)
  })

  it('telas admin restauradas existem', () => {
    for (const rel of [
      'app/admin/clientes/page.tsx',
      'app/admin/fornecedores/page.tsx',
      'app/admin/financeiro/page.tsx',
      'app/admin/financeiro/_components/FinanceiroContent.tsx',
      'app/admin/vendas/_components/VendaDetailSheet.tsx',
    ]) {
      expect(exists(rel), rel).toBe(true)
    }
  })

  it('financeiro unificado expõe abas receber/pagar/fiscal', () => {
    const src = read('app/admin/financeiro/_components/FinanceiroContent.tsx')
    expect(src).toContain('receber')
    expect(src).toContain('pagar')
    expect(src).toContain('fiscal')
  })

  it('cancelamento e finalização revalidam /admin/vendas', () => {
    // O caminho agora é declarativo: a action publica o evento de domínio e o
    // mapa único resolve as telas. O contrato ("/admin/vendas cai") continua o
    // mesmo — verificado nas duas pontas, não numa string literal.
    const src = read('app/caixa/server/caixaVendas.impl.ts')
    expect(src).toContain("revalidarDominio('venda.cancelada')")
    expect(src).toContain("revalidarDominio('venda.finalizada')")
    expect(TELAS_POR_EVENTO['venda.cancelada']).toContain(ROUTES.admin.vendas)
    expect(TELAS_POR_EVENTO['venda.finalizada']).toContain(ROUTES.admin.vendas)
  })

  it('sangria/suprimento e fechamento de turno revalidam /admin/vendas', () => {
    // Regressão real: antes revalidavam só '/gerente/caixas', que é redirect —
    // a tela de turnos do gerente ficava velha depois de toda sangria.
    expect(TELAS_POR_EVENTO['caixa.movimentacao.alterada']).toContain(ROUTES.admin.vendas)
    expect(TELAS_POR_EVENTO['caixa.turno.alterado']).toContain(ROUTES.admin.vendas)
  })

  it('recebimento de mercadoria revalida /admin/estoque', () => {
    expect(TELAS_POR_EVENTO['estoque.recebido']).toContain(ROUTES.admin.estoque)
    expect(TELAS_POR_EVENTO['estoque.recebido']).toContain(ROUTES.admin.estoqueRecebimento)
  })

  it('nenhuma tela do mapa aponta para rota legada /gerente', () => {
    for (const [evento, telas] of Object.entries(TELAS_POR_EVENTO)) {
      for (const tela of telas) {
        expect(tela.startsWith('/gerente'), `${evento} → ${tela}`).toBe(false)
      }
    }
  })

  it('VendaDetailSheet integra cancelamento', () => {
    const src = read('app/admin/vendas/_components/VendaDetailSheet.tsx')
    expect(src).toContain('VendaCancelarModal')
  })

  it('catálogo qty estoque linka para /admin/estoque (read-only)', () => {
    const src = read('app/admin/catalogo/_components/CatalogoTable.tsx')
    expect(src).toContain('adminEstoqueProdutoQuery')
    expect(src).not.toMatch(/atualizarEstoqueProduto/)
  })

  it('deep-link catalogoNovo resolve para modal no catálogo', () => {
    const expected = pathWithQuery(ROUTES.admin.catalogo, new URLSearchParams({ modal: 'novo' }))
    expect(expected).toBe('/admin/catalogo?modal=novo')
  })
})

describe('consolidação pós-audit — jornadas críticas (contrato estático)', () => {
  it('J1 Produto: entrada única via catálogo + etiquetas em estoque', () => {
    expect(exists('components/gerente/produtos/NovoProdutoModal.tsx')).toBe(true)
    expect(exists('app/admin/estoque/imprimir-etiquetas/page.tsx')).toBe(true)
    expect(exists('app/caixa/page.tsx')).toBe(true)
  })

  it('J2 Venda: caixa finaliza e admin lista vendas', () => {
    expect(exists('app/caixa/actions.ts')).toBe(true)
    expect(exists('app/admin/vendas/page.tsx')).toBe(true)
    const vendasPage = read('app/admin/vendas/page.tsx')
    expect(vendasPage).toContain('buscarVendasPaginadasAction')
  })

  it('J3 Cancelamento: RPC transacional restaura estoque e ajusta caixa', () => {
    const rpc = read('../backend/supabase/migrations/229_venda_eventos_rpc_hooks.sql')
    expect(rpc).toContain('cancelar_venda_transacional')
    expect(rpc).toContain('quantidade_atual = e.quantidade_atual + v_item.quantidade')
    expect(rpc).toContain('saldo_atual')
    expect(read('app/caixa/server/caixaVendas.impl.ts')).toContain('cancelar_venda_transacional')
  })

  it('J4 Financeiro: receber e pagar no admin financeiro', () => {
    const extras = read('app/admin/financeiro/_components/FinanceiroReceberExtras.tsx')
    expect(extras).toContain('criarTituloReceber')
    expect(extras).toContain('liquidarTitulo')
    const content = read('app/admin/financeiro/_components/FinanceiroContent.tsx')
    expect(content).toContain('ContasPagarListClient')
  })

  it('J5 NF-e: importação em estoque', () => {
    expect(exists('app/admin/estoque/importar-nfe/page.tsx')).toBe(true)
    expect(exists('app/admin/financeiro/_components/DocumentoFiscalDetailSheet.tsx')).toBe(true)
  })
})

describe('consolidação pós-audit — guarda SSoT', () => {
  it('regra Cursor entity-ssot existe', () => {
    const rulePath = path.resolve(ROOT, '..', '.cursor', 'rules', 'entity-ssot.mdc')
    expect(fs.existsSync(rulePath)).toBe(true)
  })

  it('telas órfãs do gerente foram removidas (validação concluída)', () => {
    // Eram segundas implementações das mesmas telas que existem em
    // /admin/*/_components. Nenhuma rota as renderizava — /gerente/* é redirect.
    const removidas = [
      'app/gerente/financeiro/FinanceiroGerentePageClient.tsx',
      'app/gerente/produtos/ProdutosGerentePageClient.tsx',
      'app/gerente/vendas/VendasGerenteListClient.tsx',
      'app/gerente/relatorios/RelatoriosGerentePageClient.tsx',
      'app/gerente/comissoes/ComissoesPageClient.tsx',
      'app/gerente/suspensao/SuspensaoPageClient.tsx',
      'app/gerente/configuracoes/ConfiguracoesClient.tsx',
      'app/gerente/configuracoes/ConfiguracoesGerentePageClient.tsx',
      'lib/navigation/adminSidebarNav.ts',
    ]
    for (const rel of removidas) {
      expect(exists(rel), rel).toBe(false)
    }
  })

  it('entrada de mercadoria tem autoridade de escrita única', () => {
    // NF-e, remessa e ordem de compra — as três portas de entrada passam pelo
    // InventoryMovementWriter. A OC chamava a RPC direto.
    const writer = read('app/admin/estoque/inventoryMovementWriter.ts')
    for (const rpc of [
      'importar_nfe_transacao',
      'confirmar_remessa_entrada',
      'receber_ordem_compra',
      'transferir_estoque_seguro',
    ]) {
      expect(writer, rpc).toContain(rpc)
    }
    const compras = read('app/gerente/compras/actions.ts')
    expect(compras).toContain('createInventoryMovementWriter')
    expect(compras).not.toMatch(/\.rpc\(\s*['"]receber_ordem_compra['"]/)
  })

  it('estoque inicial no create é TX atômica (RPC 270), não 2º round-trip no modal', () => {
    const modal = read('components/gerente/produtos/ProdutoFormModal.tsx')
    expect(modal).toContain('EXCEÇÃO SSoT')
    expect(modal).toContain('criar_produto_com_estoque_inicial')
    expect(modal).toContain('estoque_inicial_quantidade')
    expect(modal).toContain('sincronizarFaixaAtacado')
    expect(modal).not.toContain('aplicarEstoqueInicial')
    const rule = fs.readFileSync(path.resolve(ROOT, '..', '.cursor', 'rules', 'entity-ssot.mdc'), 'utf8')
    expect(rule).toContain('criar_produto_com_estoque_inicial')
    expect(rule).toContain('TX atômica')
  })

  it('script check:entity-ssot registrado no package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.['check:entity-ssot']).toContain('check-entity-ssot-boundary')
    expect(pkg.scripts?.['check:revalidate']).toContain('check-revalidate-boundary')
    expect(pkg.scripts?.['test:integration:cancelamento']).toContain('vitest.integration.config')
  })
})
