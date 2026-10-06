import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

export type HubNavLabelSet = {
  catalogoProdutos: string
  catalogoCategorias: string
  catalogoMarcas: string
  estoqueSaldos: string
  estoqueMovimentacoes?: string
  estoqueRecebimento: string
  estoqueTransferencias: string
  estoqueImportarNfe: string
  estoqueEtiquetas: string
  financeiroReceber: string
  financeiroPagar: string
  financeiroFiscal: string
  financeiroCategorias: string
}

export function buildCatalogoHubTabs(labels: HubNavLabelSet): readonly HubTabDef[] {
  return [
    { id: 'produtos', label: labels.catalogoProdutos, href: ROUTES.admin.catalogo, match: 'prefix' },
    {
      id: 'categorias',
      label: labels.catalogoCategorias,
      href: ROUTES.admin.categoriasProdutos,
      match: 'prefix',
    },
    { id: 'marcas', label: labels.catalogoMarcas, href: ROUTES.admin.marcasProdutos, match: 'prefix' },
  ]
}

export function buildEstoqueHubTabs(labels: HubNavLabelSet): readonly HubTabDef[] {
  return [
    { id: 'saldos', label: labels.estoqueSaldos, href: ROUTES.admin.estoque, match: 'exact' },
    {
      id: 'recebimento',
      label: labels.estoqueRecebimento,
      href: ROUTES.admin.estoqueRecebimento,
      aliases: [ROUTES.admin.importNfe],
      match: 'prefix',
    },
    { id: 'movimentacoes', label: labels.estoqueMovimentacoes ?? 'Movimentações', href: ROUTES.admin.estoqueMovimentacoes, match: 'prefix' },
    {
      id: 'transferencias',
      label: labels.estoqueTransferencias,
      href: ROUTES.admin.estoqueTransferencias,
      match: 'prefix',
    },

  ]
}

export function hubLabelsFromAdminUi(ui: {
  hub_catalogo_produtos: string
  hub_catalogo_categorias: string
  hub_catalogo_marcas: string
  hub_estoque_movimentacoes?: string
  hub_estoque_saldos: string
  hub_estoque_recebimento: string
  hub_estoque_transferencias: string
  hub_estoque_importar_nfe: string
  hub_estoque_etiquetas: string
  hub_financeiro_receber: string
  hub_financeiro_pagar: string
  hub_financeiro_fiscal: string
  hub_financeiro_categorias: string
}): HubNavLabelSet {
  return {
    catalogoProdutos: ui.hub_catalogo_produtos,
    catalogoCategorias: ui.hub_catalogo_categorias,
    catalogoMarcas: ui.hub_catalogo_marcas,
    estoqueSaldos: ui.hub_estoque_saldos,
    estoqueMovimentacoes: ui.hub_estoque_movimentacoes,
    estoqueRecebimento: ui.hub_estoque_recebimento,
    estoqueTransferencias: ui.hub_estoque_transferencias,
    estoqueImportarNfe: ui.hub_estoque_importar_nfe,
    estoqueEtiquetas: ui.hub_estoque_etiquetas,
    financeiroReceber: ui.hub_financeiro_receber,
    financeiroPagar: ui.hub_financeiro_pagar,
    financeiroFiscal: ui.hub_financeiro_fiscal,
    financeiroCategorias: ui.hub_financeiro_categorias,
  }
}
