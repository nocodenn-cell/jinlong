import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/**
 * Hubs operacionais, organizados pela jornada da loja (IA por jornada, 2026-10-15):
 *   Vender     → vendas, caixas, clientes, revisão offline
 *   Abastecer  → pedido de compra → recebimento → etiquetas, + fornecedores
 *   Loja/equipe→ dados da loja, funcionários, categorias financeiras, suspensão
 * Cada rota pertence a um único hub. Rotas e SSOT das entidades não mudam.
 */
export type OperationalHubId = 'vendas' | 'compras' | 'loja'

export type OperationalHubLabelSet = {
  vendasVendas: string
  vendasCaixas: string
  vendasClientes: string
  /** Fila de revisão de vendas offline (DONO/GERENTE). */
  vendasRevisaoOffline?: string
  comprasPedidos: string
  comprasRecebimento: string
  comprasEtiquetas: string
  comprasFornecedores: string
  lojaDados: string
  lojaFuncionarios: string
  lojaCategoriasFinanceiras: string
  lojaSuspensao: string
  /** Assinatura da Jinlong (plano, faturas) — o DONO gerencia; demais perfis só consultam. */
  lojaAssinatura?: string
}

export function buildOperationalHubTabs(
  hub: OperationalHubId,
  labels: OperationalHubLabelSet,
): readonly HubTabDef[] {
  switch (hub) {
    case 'vendas':
      return [
        { id: 'vendas', label: labels.vendasVendas, href: ROUTES.admin.vendas, match: 'prefix' },
        { id: 'caixas', label: labels.vendasCaixas, href: ROUTES.admin.caixas, match: 'prefix' },
        { id: 'clientes', label: labels.vendasClientes, href: ROUTES.admin.clientes, match: 'prefix' },
        {
          id: 'revisao-offline',
          label: labels.vendasRevisaoOffline ?? 'Revisão offline',
          href: ROUTES.admin.revisaoOffline,
          match: 'prefix',
        },
      ]
    case 'compras':
      return [
        { id: 'pedidos', label: labels.comprasPedidos, href: ROUTES.admin.compras, match: 'prefix' },
        {
          id: 'recebimento',
          label: labels.comprasRecebimento,
          href: ROUTES.admin.estoqueRecebimento,
          aliases: [ROUTES.admin.importNfe],
          match: 'prefix',
        },
        {
          id: 'etiquetas',
          label: labels.comprasEtiquetas,
          href: ROUTES.admin.estoqueImprimirEtiquetas,
          match: 'prefix',
        },
        {
          id: 'fornecedores',
          label: labels.comprasFornecedores,
          href: ROUTES.admin.fornecedores,
          match: 'prefix',
        },
      ]
    case 'loja':
      return [
        { id: 'dados', label: labels.lojaDados, href: ROUTES.admin.configuracoes, match: 'prefix' },
        {
          id: 'funcionarios',
          label: labels.lojaFuncionarios,
          href: ROUTES.admin.funcionarios,
          match: 'prefix',
        },
        {
          id: 'categorias-financeiras',
          label: labels.lojaCategoriasFinanceiras,
          href: ROUTES.admin.categoriasFinanceiras,
          match: 'prefix',
        },
        { id: 'suspensao', label: labels.lojaSuspensao, href: ROUTES.admin.suspensao, match: 'prefix' },
        { id: 'assinatura', label: labels.lojaAssinatura ?? 'Assinatura', href: ROUTES.admin.assinatura, match: 'prefix' },
      ]
  }
}

export function operationalHubLabelsFromAdminUi(ui: {
  hub_vendas_vendas: string
  hub_vendas_caixas: string
  hub_vendas_revisao_offline?: string
  hub_pessoas_clientes: string
  hub_compras_pedidos: string
  hub_compras_recebimento: string
  hub_compras_etiquetas: string
  hub_compras_fornecedores: string
  hub_loja_dados: string
  hub_pessoas_funcionarios: string
  hub_loja_categorias_financeiras: string
  hub_loja_suspensao: string
  hub_loja_assinatura?: string
}): OperationalHubLabelSet {
  return {
    vendasVendas: ui.hub_vendas_vendas,
    vendasCaixas: ui.hub_vendas_caixas,
    vendasClientes: ui.hub_pessoas_clientes,
    vendasRevisaoOffline: ui.hub_vendas_revisao_offline,
    comprasPedidos: ui.hub_compras_pedidos,
    comprasRecebimento: ui.hub_compras_recebimento,
    comprasEtiquetas: ui.hub_compras_etiquetas,
    comprasFornecedores: ui.hub_compras_fornecedores,
    lojaDados: ui.hub_loja_dados,
    lojaFuncionarios: ui.hub_pessoas_funcionarios,
    lojaCategoriasFinanceiras: ui.hub_loja_categorias_financeiras,
    lojaSuspensao: ui.hub_loja_suspensao,
    lojaAssinatura: ui.hub_loja_assinatura,
  }
}

/** Abas de todos os hubs com rótulo pt — usado só por testes de alcance. */
export const OPERATIONAL_HUB_IDS: readonly OperationalHubId[] = ['vendas', 'compras', 'loja']
