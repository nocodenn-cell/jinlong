import { ROUTES } from '@shared-core/navigation/routes'
import type { HubTabDef } from './hubNavModel'

export type HubNavLabelSet = {
  catalogoProdutos: string
  catalogoCategorias: string
  catalogoMarcas: string
  estoqueEntrada: string
  estoqueSaldos: string
  estoqueRecebimento: string
  estoqueCompras: string
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
    {
      id: 'entrada',
      label: labels.estoqueEntrada,
      href: ROUTES.admin.estoqueEntrada,
      match: 'prefix',
    },
    { id: 'saldos', label: labels.estoqueSaldos, href: ROUTES.admin.estoque, match: 'exact' },
    {
      id: 'compras',
      label: labels.estoqueCompras,
      href: ROUTES.admin.compras,
      match: 'prefix',
    },
    {
      id: 'recebimento',
      label: labels.estoqueRecebimento,
      href: ROUTES.admin.estoqueRecebimento,
      match: 'prefix',
    },
    {
      id: 'transferencias',
      label: labels.estoqueTransferencias,
      href: ROUTES.admin.estoqueTransferencias,
      match: 'prefix',
    },
    {
      id: 'importar-nfe',
      label: labels.estoqueImportarNfe,
      href: ROUTES.admin.importNfe,
      match: 'prefix',
    },
    {
      id: 'etiquetas',
      label: labels.estoqueEtiquetas,
      href: ROUTES.admin.estoqueImprimirEtiquetas,
      match: 'prefix',
    },
  ]
}

export function hubLabelsFromAdminUi(ui: {
  hub_catalogo_produtos: string
  hub_catalogo_categorias: string
  hub_catalogo_marcas: string
  hub_estoque_entrada: string
  hub_estoque_saldos: string
  hub_estoque_recebimento: string
  hub_estoque_compras: string
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
    estoqueEntrada: ui.hub_estoque_entrada,
    estoqueSaldos: ui.hub_estoque_saldos,
    estoqueRecebimento: ui.hub_estoque_recebimento,
    estoqueCompras: ui.hub_estoque_compras,
    estoqueTransferencias: ui.hub_estoque_transferencias,
    estoqueImportarNfe: ui.hub_estoque_importar_nfe,
    estoqueEtiquetas: ui.hub_estoque_etiquetas,
    financeiroReceber: ui.hub_financeiro_receber,
    financeiroPagar: ui.hub_financeiro_pagar,
    financeiroFiscal: ui.hub_financeiro_fiscal,
    financeiroCategorias: ui.hub_financeiro_categorias,
  }
}
