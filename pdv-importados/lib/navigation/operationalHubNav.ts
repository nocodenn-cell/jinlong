import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/**
 * Hubs operacionais (UX-IA-01 PR 2): agrupam páginas irmãs numa única barra de abas.
 * Rotas e SSOT das entidades não mudam — é só o caminho entre elas.
 */
export type OperationalHubId = 'vendas' | 'compras' | 'pessoas'

export type OperationalHubLabelSet = {
  vendasVendas: string
  vendasCaixas: string
  comprasPedidos: string
  comprasFornecedores: string
  pessoasClientes: string
  pessoasFuncionarios: string
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
      ]
    case 'compras':
      return [
        { id: 'pedidos', label: labels.comprasPedidos, href: ROUTES.admin.compras, match: 'prefix' },
        {
          id: 'fornecedores',
          label: labels.comprasFornecedores,
          href: ROUTES.admin.fornecedores,
          match: 'prefix',
        },
      ]
    case 'pessoas':
      return [
        { id: 'clientes', label: labels.pessoasClientes, href: ROUTES.admin.clientes, match: 'prefix' },
        {
          id: 'funcionarios',
          label: labels.pessoasFuncionarios,
          href: ROUTES.admin.funcionarios,
          match: 'prefix',
        },
      ]
  }
}

export function operationalHubLabelsFromAdminUi(ui: {
  hub_vendas_vendas: string
  hub_vendas_caixas: string
  hub_compras_pedidos: string
  hub_compras_fornecedores: string
  hub_pessoas_clientes: string
  hub_pessoas_funcionarios: string
}): OperationalHubLabelSet {
  return {
    vendasVendas: ui.hub_vendas_vendas,
    vendasCaixas: ui.hub_vendas_caixas,
    comprasPedidos: ui.hub_compras_pedidos,
    comprasFornecedores: ui.hub_compras_fornecedores,
    pessoasClientes: ui.hub_pessoas_clientes,
    pessoasFuncionarios: ui.hub_pessoas_funcionarios,
  }
}

/** Abas de todos os hubs com rótulo pt — usado só por testes de alcance. */
export const OPERATIONAL_HUB_IDS: readonly OperationalHubId[] = ['vendas', 'compras', 'pessoas']
