/**
 * Regressão: Etiquetas não pode sumir da navegação autorizada dos hubs.
 * Causa histórica: PR #464 removeu a aba ao unificar Entradas no hub Estoque.
 * Desde a IA por jornada (2026-10-15) a aba mora em UM lugar só: Abastecer
 * (pedido de compra → recebimento → etiquetas), não mais em Estoque e Catálogo.
 */
import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { CATALOGO_HUB_TABS } from './catalogoHubNav'
import { ESTOQUE_HUB_TABS } from './estoqueHubNav'
import { buildCatalogoHubTabs, buildEstoqueHubTabs, type HubNavLabelSet } from './hubNavLabels'
import { hubTabIsActive, resolveActiveHubTabId } from './hubNavModel'
import { OPERATIONAL_HUB_IDS, buildOperationalHubTabs, type OperationalHubLabelSet } from './operationalHubNav'

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

const OP: OperationalHubLabelSet = {
  vendasVendas: 'Vendas',
  vendasCaixas: 'Caixas',
  vendasClientes: 'Clientes',
  comprasPedidos: 'Pedidos de compra',
  comprasRecebimento: 'Recebimento',
  comprasEtiquetas: 'Etiquetas',
  comprasFornecedores: 'Fornecedores',
  lojaDados: 'Dados da loja',
  lojaFuncionarios: 'Funcionários',
  lojaCategoriasFinanceiras: 'Categorias financeiras',
  lojaSuspensao: 'Suspensão de vendas',
}

const etiquetas = ROUTES.admin.estoqueImprimirEtiquetas

describe('hub nav — acesso Etiquetas (anti-regressão)', () => {
  it('hub Abastecer expõe Etiquetas na rota canônica, depois de Recebimento', () => {
    const tabs = buildOperationalHubTabs('compras', OP)
    expect(tabs.map((t) => t.id)).toEqual(['pedidos', 'recebimento', 'etiquetas', 'fornecedores'])
    expect(tabs.find((t) => t.id === 'etiquetas')?.href).toBe(etiquetas)
  })

  it('rota de etiquetas ativa a aba no hub Abastecer', () => {
    const tabs = buildOperationalHubTabs('compras', OP)
    expect(resolveActiveHubTabId(etiquetas, tabs)).toBe('etiquetas')
    expect(hubTabIsActive(etiquetas, tabs.find((t) => t.id === 'etiquetas')!)).toBe(true)
  })

  it('Etiquetas aparece em exatamente um hub (sem duplicar em Estoque/Catálogo)', () => {
    const todas = [
      ...ESTOQUE_HUB_TABS,
      ...CATALOGO_HUB_TABS,
      ...buildEstoqueHubTabs(LABELS),
      ...buildCatalogoHubTabs(LABELS),
      ...OPERATIONAL_HUB_IDS.flatMap((h) => buildOperationalHubTabs(h, OP)),
    ].filter((t) => t.href === etiquetas)
    expect(todas).toHaveLength(1)
  })
})
