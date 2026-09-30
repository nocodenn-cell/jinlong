import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_GERENTE_REDIRECTS,
  ROUTES,
  pathWithQuery,
} from '@/lib/navigation/routes'

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
    const src = read('app/caixa/server/caixaVendas.impl.ts')
    expect(src).toContain("revalidatePath('/admin/vendas')")
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
    const rpc = read('../backend/supabase/migrations/20260621002500_229_venda_eventos_rpc_hooks.sql')
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

  // O guard anterior exigia que estes arquivos existissem e carregassem `@legacy`
  // ("não apagar até validação"). A validação foi feita em 2026-08-19: as rotas
  // `/gerente` deixaram de existir — sobraram 4 `page.tsx` contra 28 em `/admin`,
  // e `app/gerente/[...path]/page.tsx` redireciona tudo via `legacyGerenteRedirect`.
  // Nada importava os clientes de página. Removidos com autorização do dono.
  //
  // O guard foi INVERTIDO em vez de apagado: protegia contra remoção prematura,
  // agora protege contra reintrodução. As Server Actions vizinhas seguem vivas e
  // são consumidas pelas telas de `/admin` — por isso o teste mira os arquivos,
  // não os diretórios.
  it('clientes de página do gerente não voltaram (rotas migraram para /admin)', () => {
    const removidos = [
      'app/gerente/compras/ComprasGerentePageClient.tsx',
      'app/gerente/financeiro/FinanceiroGerentePageClient.tsx',
      'app/gerente/produtos/ProdutosGerentePageClient.tsx',
      'app/gerente/relatorios/RelatoriosGerentePageClient.tsx',
      'app/gerente/vendas/VendasGerenteListClient.tsx',
    ]
    for (const rel of removidos) {
      expect(exists(rel), `${rel} voltou — as rotas do gerente vivem em /admin`).toBe(false)
    }
  })

  it('o catch-all que substitui as rotas do gerente continua no lugar', () => {
    expect(exists('app/gerente/[...path]/page.tsx')).toBe(true)
    expect(read('app/gerente/[...path]/page.tsx')).toContain('legacyGerenteRedirect')
  })

  it('estoque inicial no create é TX atômica (RPC 270), não 2º round-trip no modal', () => {
    // Reforma Rápido/Completo (v2, ver docs/PLANO_CADASTRO_PRODUTO_UX.md):
    // a orquestração de salvar (antes dentro de ProdutoFormModal) foi extraída
    // para useProdutoFormOrchestration, compartilhada com o Cadastro Completo —
    // é lá que este trecho e seus comentários agora vivem.
    const modal = read('components/gerente/produtos/form/useProdutoFormOrchestration.ts')
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
    expect(pkg.scripts?.['test:integration:cancelamento']).toContain('vitest.integration.config')
  })
})
