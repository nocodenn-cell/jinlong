import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { resolveActiveHubTabId } from './hubNavModel'
import {
  OPERATIONAL_HUB_IDS,
  buildOperationalHubTabs,
  type OperationalHubLabelSet,
} from './operationalHubNav'

const L: OperationalHubLabelSet = {
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

describe('hubs operacionais por jornada (Vender, Abastecer, Loja e equipe)', () => {
  it('toda aba tem rótulo e rota canônica (ROUTES)', () => {
    for (const hub of OPERATIONAL_HUB_IDS) {
      for (const t of buildOperationalHubTabs(hub, L)) {
        expect(t.label).toBeTruthy()
        expect(t.href.startsWith('/admin/')).toBe(true)
      }
    }
  })

  it('Abastecer segue o fluxo físico: pedido → recebimento → etiquetas, depois fornecedores', () => {
    expect(buildOperationalHubTabs('compras', L).map((t) => t.label)).toEqual([
      'Pedidos de compra',
      'Recebimento',
      'Etiquetas',
      'Fornecedores',
    ])
  })

  it.each([
    ['vendas', ROUTES.admin.vendas, 'vendas'],
    ['vendas', ROUTES.admin.caixas, 'caixas'],
    ['vendas', ROUTES.admin.clientes, 'clientes'],
    ['compras', ROUTES.admin.compras, 'pedidos'],
    ['compras', ROUTES.admin.estoqueRecebimento, 'recebimento'],
    ['compras', ROUTES.admin.importNfe, 'recebimento'],
    ['compras', ROUTES.admin.estoqueImprimirEtiquetas, 'etiquetas'],
    ['compras', ROUTES.admin.fornecedores, 'fornecedores'],
    ['loja', ROUTES.admin.configuracoes, 'dados'],
    ['loja', ROUTES.admin.funcionarios, 'funcionarios'],
    ['loja', ROUTES.admin.categoriasFinanceiras, 'categorias-financeiras'],
    ['loja', ROUTES.admin.suspensao, 'suspensao'],
  ] as const)('hub %s: %s marca a aba %s', (hub, path, esperado) => {
    expect(resolveActiveHubTabId(path, buildOperationalHubTabs(hub, L))).toBe(esperado)
  })

  it('nenhuma rota pertence a dois hubs operacionais', () => {
    const hrefs = OPERATIONAL_HUB_IDS.flatMap((h) => buildOperationalHubTabs(h, L).map((t) => t.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
