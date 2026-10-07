/**
 * Regressão: Etiquetas não pode sumir da navegação autorizada dos hubs.
 * Causa histórica: PR #464 removeu a aba ao unificar Entradas no hub Estoque.
 */
import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { CATALOGO_HUB_TABS } from './catalogoHubNav'
import { ESTOQUE_HUB_TABS } from './estoqueHubNav'
import {
  buildCatalogoHubTabs,
  buildEstoqueHubTabs,
  type HubNavLabelSet,
} from './hubNavLabels'
import { hubTabIsActive, resolveActiveHubTabId } from './hubNavModel'

const LABELS: HubNavLabelSet = {
  catalogoProdutos: 'Produtos',
  catalogoCategorias: 'Categorias',
  catalogoMarcas: 'Marcas',
  estoqueSaldos: 'Saldos',
  estoqueMovimentacoes: 'Movimentações',
  estoqueRecebimento: 'Entradas',
  estoqueTransferencias: 'Transferências',
  estoqueImportarNfe: 'Importar NF-e',
  estoqueEtiquetas: 'Etiquetas',
  financeiroReceber: 'Receber',
  financeiroPagar: 'Pagar',
  financeiroFiscal: 'Fiscal',
  financeiroCategorias: 'Categorias',
}

function etiquetasHref(tabs: readonly { id: string; href: string }[]): string | undefined {
  return tabs.find((t) => t.id === 'etiquetas')?.href
}

describe('hub nav — acesso Etiquetas (anti-regressão)', () => {
  it('hub Estoque expõe aba Etiquetas na rota canônica', () => {
    expect(etiquetasHref(ESTOQUE_HUB_TABS)).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
    expect(etiquetasHref(buildEstoqueHubTabs(LABELS))).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })

  it('hub Catálogo expõe aba Etiquetas na mesma rota (sem segundo módulo)', () => {
    expect(etiquetasHref(CATALOGO_HUB_TABS)).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
    expect(etiquetasHref(buildCatalogoHubTabs(LABELS))).toBe(ROUTES.admin.estoqueImprimirEtiquetas)
  })

  it('rota de etiquetas ativa a aba no hub Estoque', () => {
    const tabs = buildEstoqueHubTabs(LABELS)
    expect(resolveActiveHubTabId(ROUTES.admin.estoqueImprimirEtiquetas, tabs)).toBe('etiquetas')
    const tab = tabs.find((t) => t.id === 'etiquetas')!
    expect(hubTabIsActive(ROUTES.admin.estoqueImprimirEtiquetas, tab)).toBe(true)
  })
})
